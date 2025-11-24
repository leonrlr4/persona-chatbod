import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { verifySession } from "@/lib/session";
import { embedText } from "@/lib/embeddings";

export const runtime = "nodejs";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  let i = 0, row: string[] = [], field = "", inQuotes = false;
  while (i < len) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : "";
    if (ch === '"') { if (inQuotes && next === '"') { field += '"'; i += 2; continue; } inQuotes = !inQuotes; i++; continue; }
    if (!inQuotes && ch === ',') { row.push(field.trim()); field = ""; i++; continue; }
    if (!inQuotes && (ch === '\n' || ch === '\r')) { if (ch === '\r' && next === '\n') i++; row.push(field.trim()); field = ""; rows.push(row); row = []; i++; continue; }
    field += ch; i++;
  }
  row.push(field.trim()); rows.push(row);
  return rows.filter(r => r.length > 0);
}

function extractHashtags(text: string): string[] {
  if (!text) return [];
  const m = text.match(/#[^\s/」]+/g) || [];
  return Array.from(new Set(m.map(s => s.replace(/^#/, "").trim())));
}

function extractTraits(r: Record<string, string>): string[] {
  const raw = String(r["核心個性特徵"] || "");
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    if (/^表現[:：]/.test(line)) continue;
    const noNum = line.replace(/^\d+\.\s*/, "");
    const beforeParen = noNum.split(/[（(]/)[0];
    const name = beforeParen.split(/[:：]/)[0].trim();
    if (name) out.push(name);
  }
  return Array.from(new Set(out)).slice(0, 24);
}

export async function POST(req: Request) {
  try {
    const session = await verifySession(req);
    if (!session) return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });

    const db = await getDb();
    const fd = await req.formData();
    const file = fd.get("file");
    let csvText = "";
    if (file && typeof file !== "string") {
      csvText = Buffer.from(await (file as File).arrayBuffer()).toString("utf-8");
    } else {
      csvText = String(fd.get("text") || "");
    }
    if (!csvText.trim()) return NextResponse.json({ ok: false, error: "CSV內容缺失" }, { status: 400 });

    const table = parseCSV(csvText);
    if (table.length < 2) return NextResponse.json({ ok: false, error: "CSV格式錯誤" }, { status: 400 });
    const headers = table[0];
    const records = table.slice(1).map(values => {
      const r: Record<string, string> = {}; headers.forEach((h, idx) => { r[h] = String(values[idx] || ""); }); return r;
    });

    const docs: Array<{ id: string; name: string; story: string; traits: string[]; beliefs: string[]; tags: string[]; embedding: number[]; ownerUserId: string; visibility: "private"; created_at: Date; updated_at: Date }> = [];
    for (const r of records) {
      const id = String(r["人物ID"] || r["id"] || "").trim();
      const name = String(r["人物名稱"] || r["name"] || "").trim();
      if (!id || !name) continue;
      const refs = String(r["所屬故事/經卷"] || "").trim();
      const desc = String(r["人物特徵描述"] || "").trim();
      const behaviors = String(r["典型行為模式與案例"] || "").trim();
      const challenges = String(r["人物面臨的主要挑戰/困境"] || "").trim();
      const responses = String(r["人物如何回應困境"] || "").trim();
      const lessons = String(r["生命教訓或屬靈啟示"] || "").trim();
      const tags = extractHashtags(String(r["適用場景標籤"] || ""));
      const story = [desc, refs, behaviors, challenges, responses, lessons].filter(Boolean).join("\n\n");
      const traits: string[] = extractTraits(r);
      const beliefs: string[] = String(r["主要價值觀與信念"] || "").split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
      const emb = await embedText([name, story, traits.join(" "), beliefs.join(" ")].join("\n"));
      docs.push({ id, name, story, traits, beliefs, tags, embedding: emb, ownerUserId: session.userId, visibility: "private", created_at: new Date(), updated_at: new Date() });
    }

    if (docs.length === 0) return NextResponse.json({ ok: false, error: "無有效資料" }, { status: 400 });
    await db.collection("personas").createIndex({ id: 1 }, { unique: true });
    await db.collection("personas").createIndex({ ownerUserId: 1 });
    const ops = docs.map(d => ({ updateOne: { filter: { id: d.id }, update: { $set: d }, upsert: true } }));
    const res = await db.collection("personas").bulkWrite(ops, { ordered: false });
    return NextResponse.json({ ok: true, total: docs.length, upserted: res.upsertedCount, modified: res.modifiedCount });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
