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

    console.log("chat_stream_saved_to_db", { conversationId, userLen: userText.length, assistantLen: assistantText.length });
    return conversationId;
  } catch (dbErr: any) {
    console.error("chat_stream_save_error", { message: String(dbErr?.message || dbErr) });
    return existingConversationId || "";
  }
}

export async function POST(req: Request) {
  try {
    // Get user session (optional, for tracking)
    const session = await verifySession(req);
    const userId = session?.userId || null;

    const body = await req.json();
    const personaId: string | null = body.personaId || null;
    const conversationId: string | null = body.conversationId || null;
    const userText: string = String(body.text || "");
    console.log("chat_stream_request", { personaId, conversationId, userId, textLen: userText.length, textPreview: userText.slice(0, 100) });
    if (!userText) {
      console.log("chat_stream_text_missing");
      return NextResponse.json({ ok: false, error: "text missing" }, { status: 400 });
    }

    let systemPrompt = "You are a helpful assistant.";
    if (personaId) {
      try {
        console.log("chat_stream_persona_lookup_start", { personaId });
        const db = await getDb();
        const p = await db.collection("personas").findOne({ id: personaId });
        if (p) {
          console.log("chat_stream_persona_found", { id: personaId, name: p.name });
          systemPrompt = `以人物「${p.name}」的口吻回應。背景：${p.story}. 特質：${(p.traits||[]).join(', ')}. 信念：${(p.beliefs||[]).join(', ')}.`;
        } else {
          console.log("chat_stream_persona_not_found", { id: personaId });
        }
      } catch (e: any) {
        console.error("chat_stream_persona_lookup_error", { message: String(e?.message || e) });
      }
    }

    const key = process.env.DEEPSEEK_API_KEY || "";
    if (!key) {
      console.error("chat_stream_env_missing", { keyPresent: !!key });
      return NextResponse.json({ ok: false, error: "DEEPSEEK_API_KEY missing" }, { status: 500 });
    }
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    console.log("chat_stream_llm_init", { model, temperature: 0.7 });
    const llm = new ChatDeepSeek({ apiKey: key, model, temperature: 0.7 });

    const encoder = new TextEncoder();
    let fullResponse = "";
    let savedConversationId = conversationId;
    async function* makeIterator() {
      try {
        const stream = await llm.stream([
          ["system", systemPrompt],
          ["human", userText],
        ]);
        console.log("chat_stream_llm_stream_started");
        for await (const chunk of stream as any) {
          const c: any = (chunk && (chunk.content as any)) || "";
          const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((v: any) => (typeof v === "string" ? v : String(v?.text || ""))).join("") : "";
          if (text) {
            console.log("chat_stream_chunk", { len: text.length, preview: text.slice(0, 50) });
            fullResponse += text;
            yield encoder.encode(text);
          } else {
            console.log("chat_stream_chunk_empty");
          }
        }
      } catch (err: any) {
        console.error("chat_stream_llm_stream_error", { message: String(err?.message || err) });
        throw err;
      }
    }
    const iter = makeIterator();
    const stream = new ReadableStream({
      async pull(controller) {
        console.log("chat_stream_pull");
        const { value, done } = await (iter as any).next();
        if (done) {
          console.log("chat_stream_done");
          // Save to MongoDB after stream completes
          savedConversationId = await saveConversation(personaId, userText, fullResponse, userId || undefined, conversationId || undefined);
          controller.close();
        } else {
          console.log("chat_stream_enqueue", { size: (value && (value.byteLength || 0)) || 0 });
          controller.enqueue(value);
        }
      },
    });

    console.log("chat_stream_response_start");
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Conversation-Id": savedConversationId || "",
      },
    });
  } catch (e: any) {
    console.error("chat_stream_error", { message: String(e?.message || e), stack: e?.stack });
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}