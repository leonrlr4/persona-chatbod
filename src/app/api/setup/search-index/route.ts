import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";

const INDEX_NAME = "vector_index";
const DIM = Number(process.env.EMBEDDING_DIM || "1536");

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
    } as any;
    await db.command(cmd);
    return NextResponse.json({ ok: true, index: INDEX_NAME });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}