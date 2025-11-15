import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const personaId: string | null = body.personaId || null;
    const userText: string = String(body.text || "");
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
      return NextResponse.json({ ok: true, response: mock });
    }

    const convInputs = {
      past_user_inputs: [],
      generated_responses: [],
      text: `${systemPrompt}\nUser: ${userText}\nAssistant:`,
    };
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: convInputs,
          options: { wait_for_model: true },
        }),
      }
    );

    if (!response.ok) {
      const altModel = "gpt2";
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
        return NextResponse.json({ ok: false, error: `HuggingFace API error: ${response.status}` }, { status: 500 });
      }
      const altData = await alt.json();
      const altText = (Array.isArray(altData) ? altData[0]?.generated_text : altData?.generated_text) || "";
      const altClean = String(altText).replace(`${systemPrompt}\nUser: ${userText}\nAssistant:`, "").trim();
      return NextResponse.json({ ok: true, response: altClean || `收到，你說：「${userText}」。` });
    }

    const data = await response.json();
    const generatedText = (Array.isArray(data) ? data[0]?.generated_text : data?.generated_text) || data?.conversation?.generated_responses?.[0] || "抱歉，我無法生成回應。";
    
    // 清理回應文字
    const cleanResponse = String(generatedText).replace(`${systemPrompt}\nUser: ${userText}\nAssistant:`, "").trim();
    
    return NextResponse.json({ 
      ok: true, 
      response: cleanResponse 
    });

  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (msg.includes("MONGODB_URI") || msg.includes("MONGODB_DB")) {
      return NextResponse.json({ ok: true, response: `收到，你說：「${userText}」。` });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}