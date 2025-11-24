import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { embedText } from "@/lib/embeddings";
import { QueryInput } from "@/shared/schemas/query";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const q = QueryInput.parse(body);
    const db = await getDb();
    const col = db.collection("personas");
    const queryVector = q.embedding ?? (await embedText(q.text || ""));
    const pipeline = [
      {
        $vectorSearch: {
          index: q.index,
          path: "embedding",
          queryVector,
          numCandidates: Math.max(q.k * 40, 200),
          limit: q.k,
        },
      },
      { $addFields: { score: { $meta: "vectorSearchScore" } } },
      { $project: { embedding: 0 } },
    ];
    const cursor = col.aggregate(pipeline as unknown as any[]);
    const results = await cursor.toArray();
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
