import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { embedText } from "@/lib/embeddings";
import { PersonaInput } from "@/shared/schemas/persona";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const parsed = PersonaInput.parse(data);
    const db = await getDb();
    const col = db.collection("personas");
    const text = [parsed.name, parsed.story, parsed.traits.join(" "), parsed.beliefs.join(" ")].join("\n");
    const embedding = parsed.embedding ?? (await embedText(text));
    await col.createIndex({ id: 1 }, { unique: true });
    const res = await col.updateOne(
      { id: parsed.id },
      { $set: { ...parsed, embedding } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, upserted: res.upsertedId ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}

export async function GET() {
  try {
    const db = await getDb();
    const col = db.collection("personas");
    const list = await col.find({}, { projection: { embedding: 0 } }).limit(100).toArray();
    return NextResponse.json({ ok: true, personas: list });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}