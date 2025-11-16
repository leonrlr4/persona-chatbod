import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { ChatDeepSeek } from "@langchain/deepseek";
import { verifySession } from "@/lib/session";

export const runtime = "nodejs";

async function saveConversation(
  personaId: string | null,
  userText: string,
  assistantText: string,
  userId?: string,
  existingConversationId?: string
): Promise<string> {
  try {
    const db = await getDb();
    let conversationId = existingConversationId;

    if (!conversationId) {
      // Create new conversation
      conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await db.collection("conversations").insertOne({
        id: conversationId,
        personaId: personaId || null,
        userId: userId || null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      // Update existing conversation timestamp
      await db.collection("conversations").updateOne(
        { id: conversationId },
        { $set: { updatedAt: new Date() } }
      );
    }

    // Save messages
    await db.collection("messages").insertMany([
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}-user`,
        conversationId,
        role: "user",
        content: userText,
        timestamp: new Date()
      },
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}-assistant`,
        conversationId,
        role: "assistant",
        content: assistantText,
        timestamp: new Date()
      }
    ]);

    console.log("hf_chat_saved_to_db", { conversationId, userLen: userText.length, assistantLen: assistantText.length });
    return conversationId;
  } catch (dbErr: any) {
    console.error("hf_chat_save_error", { message: String(dbErr?.message || dbErr) });
    return existingConversationId || "";
  }
}

export async function POST(req: Request) {
  let userText: string = "";
  const t0 = Date.now();
  try {
    // Get user session (optional, for tracking)
    const session = await verifySession(req);
    const userId = session?.userId || null;

    const body = await req.json();
    const personaId: string | null = body.personaId || null;
    const conversationId: string | null = body.conversationId || null;
    userText = String(body.text || "");
    if (!userText) return NextResponse.json({ ok: false, error: "text missing" }, { status: 400 });

    let systemPrompt = "You are a helpful assistant.";
    if (personaId) {
      try {
        const db = await getDb();
        const p = await db.collection("personas").findOne({ id: personaId });
        if (p) {
          systemPrompt = `以人物「${p.name}」的口吻回應。背景：${p.story}. 特質：${(p.traits||[]).join(', ')}. 信念：${(p.beliefs||[]).join(', ')}.`;
        }
      } catch (dbError: any) {
        console.error("hf_chat_db_error", { message: String(dbError?.message || dbError) });
      }
    }

    const key = process.env.DEEPSEEK_API_KEY || "";
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    if (!key) {
      console.log("hf_chat_env_missing", { keyPresent: !!key });
      const res = NextResponse.json({ ok: false, error: "DEEPSEEK_API_KEY missing" }, { status: 500 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }
    console.log("hf_chat_llm_init", { model, temperature: 0.7 });
    const llm = new ChatDeepSeek({ apiKey: key, model, temperature: 0.7 });
    console.log("hf_chat_request");
    const result = await llm.invoke([
      ["system", systemPrompt],
      ["human", userText],
    ] as any);
    const c: any = (result && (result as any).content) || "";
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((v: any) => (typeof v === "string" ? v : String(v?.text || ""))).join("") : "";
    console.log("hf_chat_ok", { len: text.length });

    // Save to MongoDB
    const savedConversationId = await saveConversation(personaId, userText, text, userId || undefined, conversationId || undefined);

    const res = NextResponse.json({ ok: true, response: text || "", conversationId: savedConversationId });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;

  } catch (e: any) {
    const msg = String(e?.message || e || "");
    console.error("hf_chat_error", { message: msg, stack: e?.stack });
    const res = NextResponse.json({ ok: false, error: msg }, { status: 500 });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  }
}