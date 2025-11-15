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
      const db = await getDb();
      const p = await db.collection("personas").findOne({ id: personaId });
      if (p) {
        systemPrompt = `以人物「${p.name}」的口吻回應。背景：${p.story}. 特質：${(p.traits||[]).join(', ')}. 信念：${(p.beliefs||[]).join(', ')}.`;
      }
    }

    const hfToken = process.env.HUGGINGFACE_API_KEY || "";
    const model = process.env.HF_CHAT_MODEL || "microsoft/DialoGPT-medium";
    
    if (!hfToken) return NextResponse.json({ ok: false, error: "HUGGINGFACE_API_KEY missing" }, { status: 500 });

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {
            text: `${systemPrompt}\nUser: ${userText}\nAssistant:`,
          },
          parameters: {
            max_length: 1000,
            temperature: 0.7,
            top_p: 0.9,
            do_sample: true,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.generated_text || data[0]?.generated_text || "抱歉，我無法生成回應。";
    
    // 清理回應文字
    const cleanResponse = generatedText.replace(`${systemPrompt}\nUser: ${userText}\nAssistant:`, "").trim();
    
    return NextResponse.json({ 
      ok: true, 
      response: cleanResponse 
    });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}