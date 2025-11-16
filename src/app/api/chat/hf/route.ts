import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let userText: string = "";
  const t0 = Date.now();
  try {
    const body = await req.json();
    const personaId: string | null = body.personaId || null;
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
      } catch {}
    }

    const hfToken = process.env.HUGGINGFACE_API_KEY || "";
    const model = process.env.HF_CHAT_MODEL || "microsoft/DialoGPT-medium";
    
    if (!hfToken) {
      const mock = `收到，你說：「${userText}」。`;
      const res = NextResponse.json({ ok: true, response: mock });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    const prompt = `${systemPrompt}\nUser: ${userText}\nAssistant:`;
    console.log("hf_chat_request", { model, token: !!hfToken });
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 200,
            temperature: 0.7,
            top_p: 0.9,
            return_full_text: false,
            do_sample: true,
            repetition_penalty: 1.1,
          },
          options: { wait_for_model: true },
        }),
      }
    );

    if (!response.ok) {
      console.log("hf_chat_non_ok", { status: response.status });
      const altModel = "gpt2";
      const same = await fetch(`https://api-inference.huggingface.co/models/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 160,
              temperature: 0.7,
              top_p: 0.9,
              return_full_text: false,
              do_sample: true,
              repetition_penalty: 1.1,
            },
            options: { wait_for_model: true },
          }),
        }
      );
      if (same.ok) {
        const sameData = await same.json();
        const sameText = (Array.isArray(sameData) ? sameData[0]?.generated_text : sameData?.generated_text) || "";
        const sameClean = String(sameText).replace(`${systemPrompt}\nUser: ${userText}\nAssistant:`, "").trim();
        const res = NextResponse.json({ ok: true, response: sameClean || `收到，你說：「${userText}」。` });
        res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
        return res;
      }
      const alt = await fetch(`https://api-inference.huggingface.co/models/${altModel}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: `${systemPrompt}\nUser: ${userText}\nAssistant:`,
            parameters: {
              max_new_tokens: 200,
              temperature: 0.7,
              top_p: 0.9,
              return_full_text: false,
              do_sample: true,
            },
            options: { wait_for_model: true },
          }),
        }
      );
      if (!alt.ok) {
        console.log("hf_alt_non_ok", { status: alt.status });
        const mock = `收到，你說：「${userText}」。`;
        const res = NextResponse.json({ ok: true, response: mock });
        res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
        return res;
      }
      const altData = await alt.json();
      const altText = (Array.isArray(altData) ? altData[0]?.generated_text : altData?.generated_text) || "";
      const altClean = String(altText).replace(`${systemPrompt}\nUser: ${userText}\nAssistant:`, "").trim();
      const res = NextResponse.json({ ok: true, response: altClean || `收到，你說：「${userText}」。` });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    const data = await response.json();
    console.log("hf_chat_ok");
    const generatedText = (Array.isArray(data) ? data[0]?.generated_text : data?.generated_text) || data?.conversation?.generated_responses?.[0] || "抱歉，我無法生成回應。";
    
    // 清理回應文字
    const cleanResponse = String(generatedText).replace(`${systemPrompt}\nUser: ${userText}\nAssistant:`, "").trim();
    
    const res = NextResponse.json({ 
      ok: true, 
      response: cleanResponse 
    });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;

  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (msg.includes("MONGODB_URI") || msg.includes("MONGODB_DB")) {
      const res = NextResponse.json({ ok: true, response: `收到，你說：「${userText}」。` });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }
    const res = NextResponse.json({ ok: false, error: msg }, { status: 500 });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  }
}