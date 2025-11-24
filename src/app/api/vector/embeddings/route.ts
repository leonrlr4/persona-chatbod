import { NextResponse } from "next/server";
import { rebuildPersonaEmbeddings, findSimilarCharacters } from "@/lib/vector-embeddings";
import { verifyCsrf } from "@/lib/csrf";
import { z } from "zod";

const GenerateEmbeddingSchema = z.object({
  characterId: z.string().optional(),
  regenerate: z.boolean().optional().default(false)
});

const SimilarCharactersSchema = z.object({
  characterId: z.string(),
  limit: z.number().min(1).max(10).optional().default(5)
});

// POST /api/vector/embeddings - 生成向量嵌入
export async function POST(req: Request) {
  try {
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }

    const body = await req.json();
    const { characterId, regenerate } = GenerateEmbeddingSchema.parse(body);

    if (characterId && !regenerate) {
      return NextResponse.json({ 
        ok: false, 
        error: "如要指定特定人物，請設置 regenerate=true" 
      }, { status: 400 });
    }

    const result = await rebuildPersonaEmbeddings();
    
    if ((result as unknown as { ok?: boolean }).ok) {
      return NextResponse.json({ 
        ok: true, 
        message: `成功更新向量嵌入`,
        updated: (result as unknown as { updated?: number }).updated
      });
    } else {
      return NextResponse.json({ 
        ok: false, 
        error: (result as unknown as { message?: string }).message || "向量更新失敗"
      }, { status: 500 });
    }

  } catch (error: unknown) {
    console.error("向量生成錯誤:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : "向量生成失敗"
    }, { status: 400 });
  }
}

// GET /api/vector/embeddings?characterId=XXX&limit=N - 查找相似人物
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

    const similarCharacters = await findSimilarCharacters(characterId, limit);

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
