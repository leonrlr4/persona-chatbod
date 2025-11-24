import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { PrefsSchema } from "@/shared/schemas/prefs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || "";
    if (!userId) return NextResponse.json({ ok: false, error: "userId missing" }, { status: 400 });
    const db = await getDb();
    const col = db.collection("prefs");
    const doc = await col.findOne({ userId });
    return NextResponse.json({ ok: true, prefs: doc });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prefs = PrefsSchema.parse(body);
    const db = await getDb();
    const col = db.collection("prefs");
    await col.createIndex({ userId: 1 }, { unique: true });
    await col.updateOne({ userId: prefs.userId }, { $set: prefs }, { upsert: true });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
