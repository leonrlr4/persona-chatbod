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
    const targetEmbedding = await db.collection('character_embeddings').findOne({ 
      character_id: characterId 
    });
    
    if (!targetEmbedding) {
      return NextResponse.json({ 
        ok: false, 
        error: `找不到人物 ${characterId} 的向量嵌入`
      }, { status: 404 });
    }

    console.log(`🔍 搜尋與 ${targetEmbedding.character_name.chinese} 相似的人物...`);

    try {
      // 使用 MongoDB Atlas 向量搜尋
      const similarCharacters = await db.collection('character_embeddings').aggregate([
        {
          $vectorSearch: {
            index: "character_vector_index",
            path: "embedding",
            queryVector: targetEmbedding.embedding,
            numCandidates: 100,
            limit: limit + 1 // +1 因為會包含自己
          }
        },
        {
          $match: {
            character_id: { $ne: characterId } // 排除自己
          }
        },
        {
          $limit: limit
        },
        {
          $project: {
            character_id: 1,
            character_name: 1,
            score: { $meta: "vectorSearchScore" }
          }
        }
      ]).toArray();

      console.log(`✅ 找到 ${similarCharacters.length} 個相似人物`);

      return NextResponse.json({ 
        ok: true, 
        characterId,
        similarCharacters: similarCharacters.map(char => ({
          character_id: char.character_id,
          character_name: char.character_name,
          similarity: char.score || 0
        }))
      });

    } catch (vectorError) {
      console.error('向量搜尋失敗，使用後備方案:', vectorError);
      
      // 後備方案：基於關鍵詞的相似度搜尋
      const fallbackResults = await fallbackSimilaritySearch(characterId, limit);
      
      return NextResponse.json({ 
        ok: true, 
        characterId,
        similarCharacters: fallbackResults,
        note: "使用關鍵詞相似度搜尋（向量搜尋未配置）"
      });
    }

  } catch (error: any) {
    console.error("相似搜尋錯誤:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "相似搜尋失敗"
    }, { status: 400 });
  }
}

// 後備方案：基於關鍵詞的相似度搜尋
async function fallbackSimilaritySearch(characterId: string, limit: number) {
  const db = await getDb();
  
  const targetCharacter = await db.collection('bible_characters').findOne({ 
    character_id: characterId 
  });
  
  if (!targetCharacter) {
    throw new Error(`找不到人物 ${characterId}`);
  }
  
  // 提取關鍵詞
  const keywords = [
    ...targetCharacter.core_traits.chinese,
    ...targetCharacter.values_beliefs.chinese,
    ...targetCharacter.applicable_scenarios.chinese
  ].join(' ');
  
  // 找到其他人物並計算簡單相似度
  const allCharacters = await db.collection('bible_characters').find({
    character_id: { $ne: characterId }
  }).toArray();
  
  const similarities = allCharacters.map(char => {
    const charKeywords = [
      ...char.core_traits.chinese,
      ...char.values_beliefs.chinese,
      ...char.applicable_scenarios.chinese
    ].join(' ');
    
    // 簡單的關鍵詞重疊計算
    const overlap = countKeywordOverlap(keywords, charKeywords);
    const score = overlap / Math.max(keywords.length, charKeywords.length);
    
    return {
      character_id: char.character_id,
      character_name: char.character_name,
      similarity: score
    };
  });
  
  // 按相似度排序並返回前N個
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function countKeywordOverlap(text1: string, text2: string): number {
  const words1 = text1.split(/\s+/);
  const words2 = text2.split(/\s+/);
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let overlap = 0;
  set1.forEach(word => {
    if (set2.has(word)) overlap++;
  });
  
  return overlap;
}