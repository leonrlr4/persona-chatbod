import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";

const INDEX_NAME = "vector_index";
const DIM = Number(process.env.EMBEDDING_DIM || "384");

export async function POST() {
  try {
    const db = await getDb();
    const cmd = {
      createSearchIndexes: "personas",
      indexes: [
        {
          name: INDEX_NAME,
          definition: {
            mappings: {
              dynamic: false,
              fields: {
                embedding: {
                  type: "vector",
                  dimensions: DIM,
                  similarity: "cosine",
                },
              },
            },
          },
        },
      ],
    } as unknown;
    await db.command(cmd as object);
    return NextResponse.json({ ok: true, index: INDEX_NAME });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const url = new URL(req.url);
    const dropPersonas = url.searchParams.get("dropPersonas") === "true";
    const dropMessages = url.searchParams.get("dropMessages") === "true" || url.searchParams.has("dropMessages");
    const dropConversations = url.searchParams.get("dropConversations") === "true" || url.searchParams.has("dropConversations");
    if (dropPersonas) {
      try { await db.collection("personas").deleteMany({}); } catch {}
    }
    if (dropMessages) {
      try { await db.collection("messages").deleteMany({}); } catch {}
    }
    if (dropConversations) {
      try { await db.collection("conversations").deleteMany({}); } catch {}
    }
    const col = db.collection("personas");
    type SearchIndex = { name?: string; definition?: { mappings?: { fields?: { embedding?: { dimensions?: number; similarity?: string } } } }; spec?: { definition?: { mappings?: { fields?: { embedding?: { dimensions?: number; similarity?: string } } } } } };
    let indexes: SearchIndex[] = [];
    try {
      const colAny = col as unknown as { listSearchIndexes?: () => { toArray: () => Promise<unknown[]> } };
      if (typeof colAny.listSearchIndexes === "function") {
        const cursor = colAny.listSearchIndexes();
        indexes = await cursor.toArray() as unknown as SearchIndex[];
      }
    } catch {}
    if (!indexes || indexes.length === 0) {
      try {
        const res = await db.command({ listSearchIndexes: "personas" } as unknown as object) as unknown as { indexes?: unknown[] };
        indexes = Array.isArray(res?.indexes) ? (res.indexes as unknown as SearchIndex[]) : [];
      } catch {}
    }
    const idx = indexes.find((i) => String(i?.name || "") === INDEX_NAME);
    const def = (idx && idx.definition) || (idx && idx.spec?.definition) || {};
    const dims = Number((def as { mappings?: { fields?: { embedding?: { dimensions?: number } } } }).mappings?.fields?.embedding?.dimensions ?? 0);
    const sim = String((def as { mappings?: { fields?: { embedding?: { similarity?: string } } } }).mappings?.fields?.embedding?.similarity ?? "");
    return NextResponse.json({ ok: true, index: INDEX_NAME, dimensions: dims || DIM, similarity: sim || "cosine", exists: !!idx, personasCleared: dropPersonas, messagesCleared: dropMessages, conversationsCleared: dropConversations });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await getDb();
    const url = new URL(req.url);
    let dropPersonas = false;
    let dropMessages = false;
    let dropConversations = false;
    const hasParam = url.searchParams.has("dropPersonas");
    if (hasParam) {
      const v = (url.searchParams.get("dropPersonas") || "").trim();
      dropPersonas = v === "" || /^(true|1|yes)$/i.test(v);
    } else {
      try {
        const body = await req.json().catch(() => ({}));
        dropPersonas = !!(body && (body.dropPersonas === true || body.dropPersonas === 1));
        dropMessages = !!(body && (body.dropMessages === true || body.dropMessages === 1));
        dropConversations = !!(body && (body.dropConversations === true || body.dropConversations === 1));
      } catch {}
    }
    if (!dropPersonas) {
      const hv = (req.headers.get("x-drop-personas") || "").trim();
      dropPersonas = /^(true|1|yes)$/i.test(hv);
    }
    if (!dropMessages) {
      const hm = (req.headers.get("x-drop-messages") || "").trim();
      dropMessages = /^(true|1|yes)$/i.test(hm) || url.searchParams.has("dropMessages") || /^(true|1|yes)$/i.test(String(url.searchParams.get("dropMessages")||""));
    }
    if (!dropConversations) {
      const hc = (req.headers.get("x-drop-conversations") || "").trim();
      dropConversations = /^(true|1|yes)$/i.test(hc) || url.searchParams.has("dropConversations") || /^(true|1|yes)$/i.test(String(url.searchParams.get("dropConversations")||""));
    }
    try { await db.command({ dropSearchIndex: "character_embeddings", name: "character_vector_index" } as unknown as object); } catch {}
    const existsCE = await db.listCollections({ name: "character_embeddings" }).toArray();
    if (existsCE && existsCE.length > 0) {
      await db.collection("character_embeddings").drop();
    }
    const existsBC = await db.listCollections({ name: "bible_characters" }).toArray();
    if (existsBC && existsBC.length > 0) {
      await db.collection("bible_characters").drop();
    }
    if (dropPersonas) {
      try { await db.collection("personas").deleteMany({}); } catch {}
    }
    if (dropMessages) {
      try { await db.collection("messages").deleteMany({}); } catch {}
    }
    if (dropConversations) {
      try { await db.collection("conversations").deleteMany({}); } catch {}
    }
    return NextResponse.json({ ok: true, removedCollections: ["character_embeddings", "bible_characters"], personasCleared: dropPersonas, messagesCleared: dropMessages, conversationsCleared: dropConversations });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
