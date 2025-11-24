import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { verifyCsrf } from "@/lib/csrf";
import { z } from "zod";
import { embedText } from "@/lib/embeddings";
import bcrypt from "bcryptjs";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  let i = 0;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  while (i < len) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : "";
    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (!inQuotes && ch === ',') {
      row.push(field.trim());
      field = "";
      i++;
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field.trim());
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  row.push(field.trim());
  rows.push(row);
  return rows.filter(r => r.length > 0);
}

function parseSemicolonList(text: string): string[] {
  if (!text) return [];
  return text.split(';').map(item => item.trim()).filter(item => item.length > 0);
}

function extractHashtags(text: string): string[] {
  if (!text) return [];
  const m = text.match(/#[^\s/」]+/g) || [];
  return Array.from(new Set(m.map(s => s.replace(/^#/, "").trim())));
}

function extractKeywords(text: string): string[] {
  if (!text) return [];
  const arr: string[] = [];
  const re = /關鍵詞：([^\n]+)/g;
  let k: RegExpExecArray | null;
  while ((k = re.exec(text)) !== null) {
    const parts = k[1].split(/、|\s*\/\s*/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) arr.push(p);
  }
  return Array.from(new Set(arr));
}

const ImportSchema = z.object({
  csvContent: z.string().min(1, "CSV內容不能為空"),
  type: z.enum(["personas", "users", "bible_characters", "custom"]).default("personas")
});

export async function POST(req: Request) {
  try {
    // 管理員驗證（這裡簡化處理，實際應用需要更嚴格的驗證）
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }

    const body = await req.json();
    const { csvContent, type } = ImportSchema.parse(body);
    
    const db = await getDb();
    const table = parseCSV(csvContent);
    if (table.length < 2) {
      return NextResponse.json({ ok: false, error: "CSV格式錯誤或為空" }, { status: 400 });
    }
    const headers = table[0];
    const records: Record<string, string>[] = table.slice(1).map(values => {
      const r: Record<string, string> = {};
      headers.forEach((h, idx) => { r[h] = String(values[idx] || ""); });
      return r;
    });

    let result: { insertedCount: number };
    
    switch (type) {
      case "personas":
        result = await importPersonas(db, records);
        break;
      case "users":
        result = await importUsers(db, records as UserRecord[]);
        break;
      default:
        return NextResponse.json({ ok: false, error: "不支援的匯入類型" }, { status: 400 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: `成功匯入 ${result.insertedCount} 筆資料`,
      details: result 
    });

  } catch (error: unknown) {
    console.error("CSV匯入錯誤:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : "CSV匯入失敗" 
    }, { status: 400 });
  }
}

// 移除舊人物匯入邏輯

type CollBulkResult = { upsertedCount?: number; modifiedCount?: number };
type DBLike = { collection: (name: string) => { createIndex: (idx: unknown, opts?: unknown) => Promise<unknown>; bulkWrite: (ops: unknown, opts?: unknown) => Promise<CollBulkResult> } };

async function importPersonas(db: unknown, records: Record<string, string>[]) {
  const dbc = db as DBLike;
  const docs: Array<{ id: string; name: string; story: string; traits: string[]; beliefs: string[]; tags: string[]; embedding?: number[]; created_at: Date; updated_at: Date }> = [];
  for (const r of records) {
    const id = String(r["人物ID"] || r["人物Id"] || r["人物id"] || r["id"] || "").trim();
    const name = String(r["人物名稱"] || r["名稱"] || r["name"] || "").trim();
    if (!id || !name) continue;
    const refs = String(r["所屬故事/經卷"] || "").trim();
    const desc = String(r["人物特徵描述"] || "").trim();
    const behaviors = String(r["典型行為模式與案例"] || "").trim();
    const challenges = String(r["人物面臨的主要挑戰/困境"] || "").trim();
    const responses = String(r["人物如何回應困境"] || "").trim();
    const lessons = String(r["生命教訓或屬靈啟示"] || "").trim();
    const tags = extractHashtags(String(r["適用場景標籤"] || ""));
    const traits = extractKeywords(String(r["核心個性特徵"] || ""));
    const beliefsText = String(r["主要價值觀與信念"] || "");
    const beliefs = beliefsText.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0).slice(0, 20);
    const story = [desc, refs, behaviors, challenges, responses, lessons].filter(Boolean).join("\n\n");
    const emb = await embedText([name, story, traits.join(" "), beliefs.join(" ")].join("\n"));
    docs.push({ id, name, story, traits, beliefs, tags, embedding: emb, created_at: new Date(), updated_at: new Date() });
  }
  if (docs.length === 0) return { insertedCount: 0 } as { insertedCount: number };
  await dbc.collection("personas").createIndex({ id: 1 }, { unique: true });
  const ops = docs.map(d => ({ updateOne: { filter: { id: d.id }, update: { $set: d }, upsert: true } }));
  const res = await dbc.collection("personas").bulkWrite(ops, { ordered: false });
  const cnt = (res.upsertedCount || 0) + (res.modifiedCount || 0);
  return { insertedCount: cnt } as { insertedCount: number };
}

type CollUsers = { deleteMany: (q: unknown) => Promise<unknown>; insertMany: (docs: unknown) => Promise<unknown>; dropIndex: (n: string) => Promise<unknown>; createIndex: (idx: unknown, opts?: unknown) => Promise<unknown> };
type DBUsers = { collection: (name: string) => CollUsers };
type UserRecord = Record<string, string> & { passwordHash?: string };
async function importUsers(db: unknown, records: UserRecord[]): Promise<{ insertedCount: number }> {
  const dbc = db as DBUsers;
  const users = records.map(record => ({
    username: record.username || record.name,
    email: record.email,
    password: record.password,
    passwordHash: record.passwordHash || bcrypt.hashSync(record.password, 10),
    created_at: new Date(),
    updated_at: new Date()
  }));

  // 清除現有資料（可選）
  await dbc.collection('users').deleteMany({});
  
  const result = await dbc.collection('users').insertMany(users);
  
  try { await dbc.collection('users').dropIndex('email_1'); } catch {}
  try { await dbc.collection('users').dropIndex('username_1'); } catch {}
  await dbc.collection('users').createIndex({ email: 1 }, { unique: false });

  let cnt = 0;
  if (result && typeof result === "object") {
    const anyRes = result as Record<string, unknown>;
    if (typeof anyRes.insertedCount === "number") {
      cnt = anyRes.insertedCount;
    } else if (anyRes.insertedIds && typeof anyRes.insertedIds === "object") {
      try { cnt = Object.keys(anyRes.insertedIds as Record<string, unknown>).length; } catch { cnt = users.length; }
    } else {
      cnt = users.length;
    }
  } else {
    cnt = users.length;
  }

  return { insertedCount: cnt };
}
