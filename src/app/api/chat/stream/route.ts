import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { ChatDeepSeek } from "@langchain/deepseek";
import { verifySession } from "@/lib/session";
import { embedText } from "@/lib/embeddings";
import { buildPersonaPromptBase } from "@/lib/personaPrompt";
import { webSearch, formatSearchResults, needsWebSearch, detectLanguage } from "@/lib/webSearch";

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

    // 偵測用戶語言（中文或英文）
    const userLang = detectLanguage(userText);
    console.log("chat_stream_request", {
      personaId,
      conversationId,
      userId,
      userLang,
      textLen: userText.length,
      textPreview: userText.slice(0, 100)
    });

    if (!userText) {
      console.log("chat_stream_text_missing");
      return NextResponse.json({ ok: false, error: "text missing" }, { status: 400 });
    }
    if (!personaId) {
      console.log("chat_stream_persona_required");
      return NextResponse.json({ ok: false, error: "請先選擇人物" }, { status: 400 });
    }

    let systemPrompt = "";
    let personaName = "";
    try {
      console.log("chat_stream_persona_lookup_start", { personaId });
      const db = await getDb();
      const p = await db.collection("personas").findOne({ id: personaId });
      if (p) {
        personaName = String(p.name || "");
        console.log("chat_stream_persona_found", { id: personaId, name: personaName });
        const vis = String((p as unknown as { visibility?: string }).visibility || "public");
        const allowed = vis === "public" || ((p as unknown as { ownerUserId?: string }).ownerUserId && userId && String((p as unknown as { ownerUserId?: string }).ownerUserId) === String(userId));
        if (!allowed) {
          return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        // 建立 System Prompt，並根據用戶語言加入語言指令
        systemPrompt = buildPersonaPromptBase(
          p as unknown as { name?: string; story?: string; traits?: string[]; beliefs?: string[] },
          userLang
        );
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

    // 網路搜尋：使用 LLM 智慧判斷是否需要最新資訊
    let webSearchContext = "";
    const shouldSearch = await needsWebSearch(userText, personaName);
    if (shouldSearch) {
      console.log("websearch_triggered", { query: userText.slice(0, 100), persona: personaName });
      try {
        const searchResults = await webSearch(userText, 3);
        if (searchResults.length > 0) {
          webSearchContext = formatSearchResults(searchResults);
          console.log("websearch_context_added", { resultsCount: searchResults.length });
        } else {
          console.log("websearch_no_results");
        }
      } catch (searchError) {
        const searchMsg = searchError instanceof Error ? searchError.message : String(searchError);
        console.error("websearch_failed", { message: searchMsg });
        // 搜尋失敗不影響整體回答，繼續執行
      }
    }
    if (webSearchContext) systemPrompt = `${systemPrompt}\n${webSearchContext}`;

    if (!personaId) {
      console.log("chat_stream_persona_required");
      return NextResponse.json({ ok: false, error: "請先選擇人物" }, { status: 400 });
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
        // console.log(`${systemPrompt}\n${userText}`)
        const stream = await llm.stream(`${systemPrompt}\n${userText}`);
        console.log("chat_stream_llm_stream_started");
        const iterable = stream as unknown as AsyncIterable<unknown>;
        for await (const chunk of iterable) {
          const c = (chunk as { content?: unknown })?.content ?? "";
          const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((v: unknown) => (typeof v === "string" ? v : String((v as { text?: string })?.text || ""))).join("") : "";
          if (text) {
            // console.log("chat_stream_chunk", { len: text.length, preview: text.slice(0, 50) });
            fullResponse += text;
            yield encoder.encode(text);
          } else {
            console.log("chat_stream_chunk_empty");
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("chat_stream_llm_stream_error", { message: msg });

        // 🛡️ 內容風險檢測與優雅降級
        // 當 DeepSeek 檢測到敏感內容時（如政治敏感話題），自動重試但移除網路搜尋結果
        if ((msg.includes('Content Exists Risk') || msg.includes('content_filter')) && webSearchContext) {
          console.warn("content_risk_detected_retry", {
            error: msg,
            action: "removing_search_context_and_retry"
          });

          // 重建不含搜尋結果的系統提示
          let cleanSystemPrompt = systemPrompt.replace(webSearchContext, '');
          if (ragContext) {
            cleanSystemPrompt = cleanSystemPrompt.replace(ragContext, '');
          }

          // 添加用戶通知（透明原則）
          const userNotice = userLang === 'en'
            ? "\n\n[System Notice: Due to content restrictions, this response could not use the latest web information, but I will answer based on biblical wisdom and historical knowledge.]\n\n"
            : "\n\n[系統提示：由於內容限制，本次回應未能使用最新網路資訊，但我會基於聖經智慧和歷史知識來回答您的問題。]\n\n";

          yield encoder.encode(userNotice);
          fullResponse += userNotice;

          try {
            // 重新嘗試流式生成（不含搜尋結果）
            const retryStream = await llm.stream(`${cleanSystemPrompt}\n${userText}`);
            console.log("content_risk_retry_stream_started");

            const retryIterable = retryStream as unknown as AsyncIterable<unknown>;
            for await (const chunk of retryIterable) {
              const c = (chunk as { content?: unknown })?.content ?? "";
              const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((v: unknown) => (typeof v === "string" ? v : String((v as { text?: string })?.text || ""))).join("") : "";
              if (text) {
                fullResponse += text;
                yield encoder.encode(text);
              }
            }

            console.log("content_risk_retry_success");
            return; // 成功完成，退出
          } catch (retryErr: unknown) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error("content_risk_retry_failed", { message: retryMsg });
            // 重試失敗，繼續拋出原始錯誤
          }
        }

        throw err; // 如果無法處理或重試失敗，拋出原始錯誤
      }
    }
    const iter = makeIterator();
    const stream = new ReadableStream({
      async pull(controller) {
        // console.log("chat_stream_pull");
        const { value, done } = await (iter as unknown as AsyncIterator<Uint8Array>).next();
        if (done) {
          console.log("chat_stream_done");
          // Save to MongoDB after stream completes
          savedConversationId = await saveConversation(personaId, userText, fullResponse, userId || undefined, conversationId || undefined);
          controller.close();
        } else {
          // console.log("chat_stream_enqueue", { size: (value && (value.byteLength || 0)) || 0 });
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
