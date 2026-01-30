import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import OpenAI from "openai";
import { verifySession } from "@/lib/session";
import { embedText } from "@/lib/embeddings";
import { buildPersonaPromptBase } from "@/lib/personaPrompt";

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
  } catch (dbErr: unknown) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.error("chat_stream_save_error", { message: msg });
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
    if (!personaId) {
      console.log("chat_stream_persona_required");
      return NextResponse.json({ ok: false, error: "請先選擇人物" }, { status: 400 });
    }

    let systemPrompt = "";
    try {
      console.log("chat_stream_persona_lookup_start", { personaId });
      const db = await getDb();
      const p = await db.collection("personas").findOne({ id: personaId });
      if (p) {
        console.log("chat_stream_persona_found", { id: personaId, name: p.name });
        const vis = String((p as unknown as { visibility?: string }).visibility || "public");
        const allowed = vis === "public" || ((p as unknown as { ownerUserId?: string }).ownerUserId && userId && String((p as unknown as { ownerUserId?: string }).ownerUserId) === String(userId));
        if (!allowed) {
          return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        systemPrompt = buildPersonaPromptBase(p as unknown as { name?: string; story?: string; traits?: string[]; beliefs?: string[] });
      } else {
        console.log("chat_stream_persona_not_found", { id: personaId });
        return NextResponse.json({ ok: false, error: "人物不存在" }, { status: 400 });
      }
    } catch (e: unknown) {
      console.error("chat_stream_persona_lookup_error", { message: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ ok: false, error: "人物查詢失敗" }, { status: 500 });
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
      console.log("chat_stream_persona_required");
      return NextResponse.json({ ok: false, error: "請先選擇人物" }, { status: 400 });
    }

    const key = process.env.OPENAI_API_KEY || "";
    if (!key) {
      console.error("chat_stream_env_missing", { keyPresent: !!key });
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY missing" }, { status: 500 });
    }
    const model = process.env.CHAT_MODEL || "gpt-4o-mini";
    console.log("chat_stream_llm_init", { model, temperature: 0.7 });
    const client = new OpenAI({ apiKey: key });

    const encoder = new TextEncoder();
    let fullResponse = "";
    let savedConversationId = conversationId;
    async function* makeIterator() {
      try {
        const stream = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
          temperature: 0.7,
          stream: true,
        });
        console.log("chat_stream_llm_stream_started");
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            console.log("chat_stream_chunk", { len: delta.length, preview: delta.slice(0, 50) });
            fullResponse += delta;
            yield encoder.encode(delta);
          } else {
            console.log("chat_stream_chunk_empty");
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("chat_stream_llm_stream_error", { message: msg });
        throw err;
      }
    }
    const iter = makeIterator();
    const stream = new ReadableStream({
      async pull(controller) {
        console.log("chat_stream_pull");
        const { value, done } = await (iter as unknown as AsyncIterator<Uint8Array>).next();
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("chat_stream_error", { message: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
