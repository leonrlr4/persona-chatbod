import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const openaiOk = !!process.env.OPENAI_API_KEY;
    const hfOk = !!process.env.HUGGINGFACE_API_KEY;
    const chatModel = process.env.CHAT_MODEL || "";
    const hfChatModel = process.env.HF_CHAT_MODEL || "";
    const embeddingModel = process.env.EMBEDDING_MODEL || "";
    const embeddingDim = Number(process.env.EMBEDDING_DIM || "0");
    console.log("health", { mongo: true, openai: openaiOk, hf: hfOk, chatModel, hfChatModel, embeddingModel, embeddingDim });
    return NextResponse.json({ ok: true, env: { mongo: true, openai: openaiOk, hf: hfOk, chatModel, hfChatModel, embeddingModel, embeddingDim } });
  } catch (e: unknown) {
    const openaiOk = !!process.env.OPENAI_API_KEY;
    const hfOk = !!process.env.HUGGINGFACE_API_KEY;
    const chatModel = process.env.CHAT_MODEL || "";
    const hfChatModel = process.env.HF_CHAT_MODEL || "";
    const embeddingModel = process.env.EMBEDDING_MODEL || "";
    const embeddingDim = Number(process.env.EMBEDDING_DIM || "0");
    const msg = e instanceof Error ? e.message : String(e);
    console.log("health_error", { openai: openaiOk, hf: hfOk, chatModel, hfChatModel, embeddingModel, embeddingDim, error: msg });
    return NextResponse.json({ ok: false, error: msg, env: { mongo: false, openai: openaiOk, hf: hfOk, chatModel, hfChatModel, embeddingModel, embeddingDim } }, { status: 500 });
  }
}
