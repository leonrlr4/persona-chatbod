import { getDb } from "@/lib/mongo";
import { embeddings } from "@/lib/embeddings";

export async function rebuildPersonaEmbeddings() {
  const db = await getDb();
  const list = await db.collection('personas').find({}, { projection: { id: 1, name: 1, story: 1, traits: 1, beliefs: 1 } }).toArray();
  const updates = [] as Array<{ id: string; embedding: number[] }>;
  for (const p of list) {
    const name = String(p?.name || "");
    const story = String(p?.story || "");
    const traits = Array.isArray(p?.traits) ? p.traits.join(" ") : "";
    const beliefs = Array.isArray(p?.beliefs) ? p.beliefs.join(" ") : "";
    const text = [name, story, traits, beliefs].join("\n");
    const emb = await embeddings.embedQuery(text);
    updates.push({ id: String(p?.id || name), embedding: emb });
  }
  if (updates.length === 0) return { ok: false, updated: 0 };
  const ops = updates.map(u => ({ updateOne: { filter: { id: u.id }, update: { $set: { embedding: u.embedding, updated_at: new Date() } }, upsert: false } }));
  const res = await db.collection('personas').bulkWrite(ops, { ordered: false });
  return { ok: true, updated: res.modifiedCount };
}

export async function findSimilarCharacters(characterId: string, limit: number = 5) {
  const db = await getDb();
  const target = await db.collection('personas').findOne({ id: characterId });
  const targetEmb = target ? (target as unknown as { embedding?: number[] }).embedding : undefined;
  if (!target || !Array.isArray(targetEmb)) {
    throw new Error(`找不到人物 ${characterId} 的向量嵌入`);
  }
  const similar = await db.collection('personas').aggregate([
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: targetEmb,
        numCandidates: 100,
        limit: limit + 1
      }
    },
    { $match: { id: { $ne: characterId } } },
    { $limit: limit },
    {
      $project: {
        id: 1,
        name: 1,
        story: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ]).toArray();
  return similar;
}
