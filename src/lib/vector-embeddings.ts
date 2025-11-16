import { getDb } from "@/lib/mongo";
import { embeddings } from "@/lib/embeddings";

export async function generateCharacterEmbeddings() {
  const db = await getDb();
  
  // 獲取所有聖經人物
  const characters = await db.collection('bible_characters').find({}).toArray();
  
  console.log(`🔄 開始生成 ${characters.length} 個人物的向量嵌入...`);
  
  const embeddingsData = [];
  
  for (const character of characters) {
    try {
      // 組合人物的描述文本
      const description = `
        姓名: ${character.character_name.chinese} (${character.character_name.english})
        核心特徵: ${character.core_traits.chinese.join(', ')}
        價值觀: ${character.values_beliefs.chinese.join(', ')}
        行為模式: ${character.behavior_patterns.chinese.join(', ')}
        人生經歷: ${character.life_experience.chinese}
        主要故事: ${character.main_storyline.chinese}
        面臨挑戰: ${character.challenges.chinese}
        生命教訓: ${character.life_lessons.chinese}
        適用場景: ${character.applicable_scenarios.chinese.join(', ')}
      `.trim();

      // 生成向量嵌入
      const embedding = await embeddings.embedQuery(description);
      
      embeddingsData.push({
        character_id: character.character_id,
        character_name: character.character_name,
        description: description,
        embedding: embedding,
        embedding_dimension: embedding.length,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      console.log(`✅ 已生成: ${character.character_name.chinese}`);
    } catch (error) {
      console.error(`❌ 生成失敗: ${character.character_name.chinese}`, error);
    }
  }
  
  if (embeddingsData.length > 0) {
    // 清除現有的嵌入資料
    await db.collection('character_embeddings').deleteMany({});
    
    // 插入新的嵌入資料
    const result = await db.collection('character_embeddings').insertMany(embeddingsData);
    
    console.log(`🎉 成功生成 ${result.insertedCount} 個向量嵌入`);
    
    // 建立向量索引
    try {
      await (db.collection('character_embeddings') as any).createIndex(
        { embedding: "cosmosSearch" },
        { cosmosSearchOptions: { kind: "vector", numLists: 100, similarity: "COS", dimensions: 384 } }
      );
      console.log('✅ 向量索引建立完成');
    } catch (indexError) {
      console.log('ℹ️  向量索引可能已存在或需要手動建立');
    }
    
    return {
      success: true,
      generatedCount: embeddingsData.length,
      characters: embeddingsData.map(e => ({
        character_id: e.character_id,
        character_name: e.character_name
      }))
    };
  }
  
  return {
    success: false,
    message: '沒有成功生成任何向量嵌入'
  };
}

export async function findSimilarCharacters(characterId: string, limit: number = 5) {
  const db = await getDb();
  
  // 找到目標人物的向量
  const targetEmbedding = await db.collection('character_embeddings').findOne({ 
    character_id: characterId 
  });
  
  if (!targetEmbedding) {
    throw new Error(`找不到人物 ${characterId} 的向量嵌入`);
  }
  
  // 使用 MongoDB Atlas 向量搜尋
  try {
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
          description: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ]).toArray();
    
    return similarCharacters;
  } catch (error: unknown) {
    console.error('向量搜尋錯誤:', error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`向量搜尋失敗: ${msg}`);
  }
}

// 簡單的後備方案 - 基於關鍵詞的相似度搜尋
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
      description: `${char.life_experience.chinese.substring(0, 100)}...`,
      score: score
    };
  });
  
  // 按相似度排序並返回前N個
  return similarities
    .sort((a, b) => b.score - a.score)
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