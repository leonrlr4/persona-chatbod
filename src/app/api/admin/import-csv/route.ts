import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { verifyCsrf } from "@/lib/csrf";
import { z } from "zod";

// CSV 解析函數
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function parseSemicolonList(text: string): string[] {
  if (!text) return [];
  return text.split(';').map(item => item.trim()).filter(item => item.length > 0);
}

const ImportSchema = z.object({
  csvContent: z.string().min(1, "CSV內容不能為空"),
  type: z.enum(["bible_characters", "users", "custom"]).default("bible_characters")
});

export async function POST(req: Request) {
  try {
    // 管理員驗證（這裡簡化處理，實際應用需要更嚴格的驗證）
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }

    const body = await req.json();
    const { csvContent, type } = ImportSchema.parse(body);
    
    const db = await getDb();
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ ok: false, error: "CSV格式錯誤或為空" }, { status: 400 });
    }
    
    const headers = parseCSVLine(lines[0]);
    const records = [];
    
    // 解析CSV資料
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;
      
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      records.push(record);
    }

    let result;
    
    switch (type) {
      case "bible_characters":
        result = await importBibleCharacters(db, records);
        break;
      case "users":
        result = await importUsers(db, records);
        break;
      default:
        return NextResponse.json({ ok: false, error: "不支援的匯入類型" }, { status: 400 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: `成功匯入 ${result.insertedCount} 筆資料`,
      details: result 
    });

  } catch (error: any) {
    console.error("CSV匯入錯誤:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "CSV匯入失敗" 
    }, { status: 400 });
  }
}

async function importBibleCharacters(db: any, records: any[]) {
  const characters = records.map(record => ({
    character_id: record.CharacterID || record.character_id,
    character_name: {
      chinese: record.ChineseName || record.chinese_name,
      english: record.CharacterName || record.character_name
    },
    story_book: {
      chinese: record.StoryBook || record.story_book,
      english: record.StoryBook || record.story_book
    },
    core_traits: {
      chinese: parseSemicolonList(record.CoreTraitsCN || record.core_traits_chinese),
      english: parseSemicolonList(record.CoreTraitsEN || record.core_traits_english)
    },
    values_beliefs: {
      chinese: parseSemicolonList(record.CoreValuesCN || record.values_beliefs_chinese),
      english: parseSemicolonList(record.CoreValuesEN || record.values_beliefs_english)
    },
    behavior_patterns: {
      chinese: parseSemicolonList(record.BehaviorPatternCN || record.behavior_patterns_chinese),
      english: parseSemicolonList(record.BehaviorPatternEN || record.behavior_patterns_english)
    },
    life_experience: {
      chinese: record.LifeSummaryCN || record.life_experience_chinese,
      english: record.LifeSummaryEN || record.life_experience_english
    },
    main_storyline: {
      chinese: record.KeyEventsCN || record.main_storyline_chinese,
      english: record.KeyEventsEN || record.main_storyline_english
    },
    relationships: {
      chinese: parseSemicolonList(record.RelationshipsCN || record.relationships_chinese),
      english: parseSemicolonList(record.RelationshipsEN || record.relationships_english)
    },
    challenges: {
      chinese: record.MainChallengesCN || record.challenges_chinese,
      english: record.MainChallengesEN || record.challenges_english
    },
    response_to_challenges: {
      chinese: record.ResponseToChallengesCN || record.response_to_challenges_chinese,
      english: record.ResponseToChallengesEN || record.response_to_challenges_english
    },
    life_lessons: {
      chinese: record.LifeLessonsCN || record.life_lessons_chinese,
      english: record.LifeLessonsEN || record.life_lessons_english
    },
    applicable_scenarios: {
      chinese: parseSemicolonList(record.ApplicationTagsCN || record.applicable_scenarios_chinese),
      english: parseSemicolonList(record.ApplicationTagsEN || record.applicable_scenarios_english)
    },
    created_at: new Date(),
    updated_at: new Date()
  }));

  // 清除現有資料（可選）
  await db.collection('bible_characters').deleteMany({});
  
  const result = await db.collection('bible_characters').insertMany(characters);
  
  // 建立索引
  await db.collection('bible_characters').createIndex({ character_id: 1 }, { unique: true });
  await db.collection('bible_characters').createIndex({ 'character_name.chinese': 1 });
  await db.collection('bible_characters').createIndex({ 'character_name.english': 1 });
  
  return result;
}

async function importUsers(db: any, records: any[]) {
  const bcrypt = require('bcryptjs');
  
  const users = records.map(record => ({
    username: record.username || record.name,
    email: record.email,
    password: record.password,
    passwordHash: record.passwordHash || bcrypt.hashSync(record.password, 10),
    created_at: new Date(),
    updated_at: new Date()
  }));

  // 清除現有資料（可選）
  await db.collection('users').deleteMany({});
  
  const result = await db.collection('users').insertMany(users);
  
  // 建立非唯一索引（或視需要移除索引）
  try { await db.collection('users').dropIndex('email_1'); } catch {}
  try { await db.collection('users').dropIndex('username_1'); } catch {}
  await db.collection('users').createIndex({ email: 1 }, { unique: false });
  
  return result;
}