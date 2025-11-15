import { NextResponse } from "next/server";
import { generateCharacterEmbeddings } from "@/lib/vector-embeddings";

// 簡化的測試端點，跳過CSRF驗證
export async function POST(req: Request) {
  try {
    console.log('🔄 開始生成向量嵌入...');
    const result = await generateCharacterEmbeddings();
    
    if (result.success) {
      console.log(`✅ 成功生成 ${result.generatedCount} 個向量嵌入`);
      return NextResponse.json({ 
        ok: true, 
        message: `成功生成 ${result.generatedCount} 個向量嵌入`,
        characters: result.characters
      });
    } else {
      console.log('❌ 向量生成失敗:', result.message);
      return NextResponse.json({ 
        ok: false, 
        error: result.message || "向量生成失敗"
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("向量生成錯誤:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "向量生成失敗"
    }, { status: 400 });
  }
}