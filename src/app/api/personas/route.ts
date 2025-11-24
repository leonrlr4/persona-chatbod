import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { embedText } from "@/lib/embeddings";
import { PersonaInput } from "@/shared/schemas/persona";
import { verifySession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
    }
    const data = await req.json();
    const parsed = PersonaInput.parse(data);
    const db = await getDb();
    const col = db.collection("personas");
    const text = [parsed.name, parsed.story, parsed.traits.join(" "), parsed.beliefs.join(" ")].join("\n");
    const embedding = parsed.embedding ?? (await embedText(text));
    await col.createIndex({ id: 1 }, { unique: true });
    await col.createIndex({ ownerUserId: 1 });
    const res = await col.updateOne(
      { id: parsed.id },
      { $set: { ...parsed, embedding, ownerUserId: parsed.ownerUserId || session.userId, visibility: parsed.visibility || "private", updated_at: new Date(), created_at: new Date() } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, upserted: res.upsertedId ?? null });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await verifySession(req);
    const db = await getDb();
    const col = db.collection("personas");
    const filter = session
      ? { $or: [{ visibility: "public" }, { ownerUserId: session.userId }] }
      : { visibility: "public" };
    const list = await col.find(filter, { projection: { embedding: 0 } }).limit(200).toArray();
    return NextResponse.json({ ok: true, personas: list });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
