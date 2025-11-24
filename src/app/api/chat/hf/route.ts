import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { ChatDeepSeek } from "@langchain/deepseek";
import { verifySession } from "@/lib/session";
import { embedText } from "@/lib/embeddings";

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
  } catch (dbErr: unknown) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.error("hf_chat_save_error", { message: msg });
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

    // Require personaId
    if (!personaId) {
      console.log("hf_chat_persona_required");
      const res = NextResponse.json({ ok: false, error: "請先選擇人物" }, { status: 400 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    let systemPrompt = "";
    try {
      const db = await getDb();
      const p = await db.collection("personas").findOne({ id: personaId });
      if (!p) {
        const res = NextResponse.json({ ok: false, error: "人物不存在" }, { status: 404 });
        res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
        return res;
      }
      const vis = String((p as unknown as { visibility?: string }).visibility || "public");
      const allowed = vis === "public" || ((p as unknown as { ownerUserId?: string }).ownerUserId && userId && String((p as unknown as { ownerUserId?: string }).ownerUserId) === String(userId));
      if (!allowed) {
        const res = NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
        return res;
      }
      systemPrompt = `以人物「${p.name}」的口吻回應。背景：${p.story}. 特質：${(p.traits||[]).join(', ')}. 信念：${(p.beliefs||[]).join(', ')}.`;
    } catch (dbError: unknown) {
      console.error("hf_chat_db_error", { message: dbError instanceof Error ? dbError.message : String(dbError) });
      const res = NextResponse.json({ ok: false, error: "資料庫錯誤" }, { status: 500 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    let ragContext = "";
    try {
      const qVec = await embedText(userText);
      const results = await (await getDb()).collection("personas").aggregate([
        { $vectorSearch: { index: "vector_index", path: "embedding", queryVector: qVec, numCandidates: 200, limit: 3 } },
        { $project: { id: 1, name: 1, story: 1, score: { $meta: "vectorSearchScore" } } }
      ] as unknown as any[]).toArray();
      const lines = results.map((r: unknown) => {
        const o = r as { name?: string; story?: string };
        return `【${o.name || ""}】${String(o.story || "").slice(0, 300)}`;
      });
      ragContext = lines.length ? `參考資料：\n${lines.join("\n")}` : "";
    } catch {}
    if (ragContext) systemPrompt = `${systemPrompt}\n${ragContext}`;

    if (!personaId) {
      console.log("hf_chat_persona_required");
      const res = NextResponse.json({ ok: false, error: "請先選擇人物" }, { status: 400 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
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
    const result = await llm.invoke(`${systemPrompt}\n${userText}`);
    const c = (result as { content?: unknown })?.content ?? "";
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((v: unknown) => (typeof v === "string" ? v : String((v as { text?: string })?.text || ""))).join("") : "";
    console.log("hf_chat_ok", { len: text.length });

    // Save to MongoDB
    const savedConversationId = await saveConversation(personaId, userText, text, userId || undefined, conversationId || undefined);

    const res = NextResponse.json({ ok: true, response: text || "", conversationId: savedConversationId });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e || "");
    console.error("hf_chat_error", { message: msg });
    const res = NextResponse.json({ ok: false, error: msg }, { status: 500 });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  }
}
