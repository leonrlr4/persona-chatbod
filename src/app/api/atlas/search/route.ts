import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

// 直接使用MongoDB Atlas向量搜尋
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
    const targetEmbedding = await db.collection('character_embeddings').findOne({ 
      character_id: characterId 
    });
    
    if (!targetEmbedding) {
      return NextResponse.json({ 
        ok: false, 
        error: `找不到人物 ${characterId} 的向量嵌入`
      }, { status: 404 });
    }

    console.log(`🔍 使用Atlas向量搜尋: ${targetEmbedding.character_name.chinese}`);

    // 使用 MongoDB Atlas $vectorSearch (正確格式)
    const similarCharacters = await db.collection('character_embeddings').aggregate([
      {
        $vectorSearch: {
          index: "character_vector_index",
          path: "embedding",
          queryVector: targetEmbedding.embedding,
          numCandidates: 100,
          limit: limit + 1
        }
      },
      {
        $match: {
          character_id: { $ne: characterId }
        }
      },
      {
        $limit: limit
      },
      {
        $project: {
          _id: 0,
          character_id: 1,
          character_name: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ]).toArray();

    console.log(`✅ Atlas向量搜尋完成，找到 ${similarCharacters.length} 個相似人物`);

    return NextResponse.json({ 
      ok: true, 
      characterId,
      method: "atlas_vector_search",
      similarCharacters: similarCharacters.map(char => ({
        character_id: char.character_id,
        character_name: char.character_name,
        similarity: char.score || 0
      }))
    });

  } catch (error: any) {
    console.error("Atlas向量搜尋錯誤:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "向量搜尋失敗"
    }, { status: 400 });
  }
}