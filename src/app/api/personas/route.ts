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
    if (list.length > 0) {
      return NextResponse.json({ ok: true, personas: list });
    }

    const bibles = await db
      .collection("bible_characters")
      .find({}, { projection: { character_id: 1, character_name: 1, core_traits: 1, values_beliefs: 1, behavior_patterns: 1, life_experience: 1, main_storyline: 1, life_lessons: 1 } })
      .limit(100)
      .toArray();

    const uniq = (arr: any[]) => {
      const s = new Set<string>();
      for (const v of Array.isArray(arr) ? arr : []) {
        const t = String(v || "").trim();
        if (t) s.add(t);
      }
      return Array.from(s);
    };

    const mapped = bibles.map((b: any) => {
      const name = String(b?.character_name?.chinese || b?.character_name?.english || b?.character_id || "Unknown");
      const stories = [
        String(b?.life_experience?.chinese || ""),
        String(b?.life_experience?.english || ""),
        String(b?.main_storyline?.chinese || ""),
        String(b?.main_storyline?.english || ""),
        String(b?.life_lessons?.chinese || ""),
        String(b?.life_lessons?.english || ""),
      ].filter(Boolean);
      const traits = uniq([
        ...(Array.isArray(b?.core_traits?.chinese) ? b.core_traits.chinese : []),
        ...(Array.isArray(b?.core_traits?.english) ? b.core_traits.english : []),
        ...(Array.isArray(b?.behavior_patterns?.chinese) ? b.behavior_patterns.chinese : []),
        ...(Array.isArray(b?.behavior_patterns?.english) ? b.behavior_patterns.english : []),
      ]);
      const beliefs = uniq([
        ...(Array.isArray(b?.values_beliefs?.chinese) ? b.values_beliefs.chinese : []),
        ...(Array.isArray(b?.values_beliefs?.english) ? b.values_beliefs.english : []),
      ]);
      return {
        id: String(b?.character_id || b?.character_name?.english || b?.character_name?.chinese || "unknown"),
        name,
        story: stories.join("\n\n").trim(),
        traits,
        beliefs,
      };
    });

    return NextResponse.json({ ok: true, personas: mapped });
  } catch (e: any) {
    if (String(e?.message || e).includes("MONGODB_URI")) {
      return NextResponse.json({
        ok: true,
        personas: [
          { id: "demo-1", name: "Abraham" },
          { id: "demo-2", name: "Moses" },
        ],
      });
    }
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}