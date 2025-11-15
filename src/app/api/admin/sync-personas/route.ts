import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo";
import { embedText } from "@/lib/embeddings";

export const runtime = "nodejs";

const Input = z.object({
  limit: z.number().min(1).max(1000).default(100),
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function uniq(arr: string[]) {
  const set = new Set<string>();
  for (const a of arr) {
    const v = String(a || "").trim();
    if (v) set.add(v);
  }
  return Array.from(set);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { limit } = Input.parse(body);
    const db = await getDb();

    const chars = await db
      .collection("bible_characters")
      .find({}, { projection: { character_id: 1, character_name: 1, core_traits: 1, values_beliefs: 1, behavior_patterns: 1, life_experience: 1, main_storyline: 1, life_lessons: 1 } })
      .limit(limit)
      .toArray();

    const col = db.collection("personas");
    await col.createIndex({ id: 1 }, { unique: true });

    const personas = [] as Array<{ id: string; name: string; story: string; traits: string[]; beliefs: string[]; embedding: number[] }>;

    for (const c of chars) {
      const name = String(c?.character_name?.chinese || c?.character_name?.english || c?.character_id || "").trim();
      const id = String(c?.character_id || slugify(name || "unknown"));
      const stories = [
        String(c?.life_experience?.chinese || ""),
        String(c?.life_experience?.english || ""),
        String(c?.main_storyline?.chinese || ""),
        String(c?.main_storyline?.english || ""),
        String(c?.life_lessons?.chinese || ""),
        String(c?.life_lessons?.english || ""),
      ].filter(Boolean);
      const story = stories.join("\n\n").trim() || name;
      const traits = uniq([
        ...(Array.isArray(c?.core_traits?.chinese) ? c.core_traits.chinese : []),
        ...(Array.isArray(c?.core_traits?.english) ? c.core_traits.english : []),
        ...(Array.isArray(c?.behavior_patterns?.chinese) ? c.behavior_patterns.chinese : []),
        ...(Array.isArray(c?.behavior_patterns?.english) ? c.behavior_patterns.english : []),
      ]);
      const beliefs = uniq([
        ...(Array.isArray(c?.values_beliefs?.chinese) ? c.values_beliefs.chinese : []),
        ...(Array.isArray(c?.values_beliefs?.english) ? c.values_beliefs.english : []),
      ]);

      const text = [name, story, traits.join(" "), beliefs.join(" ")].join("\n");
      const embedding = await embedText(text);
      personas.push({ id, name, story, traits, beliefs, embedding });
    }

    const ops = personas.map(p => ({
      updateOne: {
        filter: { id: p.id },
        update: { $set: p },
        upsert: true,
      },
    }));

    const res = ops.length > 0 ? await col.bulkWrite(ops, { ordered: false }) : null;

    return NextResponse.json({
      ok: true,
      total: personas.length,
      upserted: res ? res.upsertedCount : 0,
      modified: res ? res.modifiedCount : 0,
      matched: res ? res.matchedCount : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}