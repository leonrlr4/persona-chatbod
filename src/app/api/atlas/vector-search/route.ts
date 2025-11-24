import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

// 簡化的相似人物搜尋 - 使用MongoDB Atlas向量搜尋
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');
    const limit = parseInt(searchParams.get('limit') || '5');

    if (!characterId) {
      return NextResponse.json({ 
        ok: false, 
        error: "請提供 characterId 參數"
      }, { status: 400 });
    }

    const db = await getDb();
    
    // 找到目標人物的向量
    const target = await db.collection('personas').findOne({ 
      id: characterId 
    });
    
    const targetEmb = target ? (target as unknown as { embedding?: number[] }).embedding : undefined;
    if (!target || !Array.isArray(targetEmb)) {
      return NextResponse.json({ 
        ok: false, 
        error: `找不到人物 ${characterId} 的向量嵌入`
      }, { status: 404 });
    }

    const similarCharacters = await db.collection('personas').aggregate([
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
          score: { $meta: "vectorSearchScore" }
        }
      }
    ]).toArray();

    return NextResponse.json({ 
      ok: true, 
      characterId,
      similarCharacters: similarCharacters.map(char => ({
        id: char.id,
        name: char.name,
        similarity: char.score || 0
      }))
    });

  } catch (error: unknown) {
    console.error("相似搜尋錯誤:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : "相似搜尋失敗"
    }, { status: 400 });
  }
}
