import OpenAI from "openai";
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

    const key = process.env.OPENAI_API_KEY || "";
    if (!key) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY missing" }, { status: 500 });
    const model = process.env.CHAT_MODEL || "gpt-4o-mini";
    console.log("openai_chat_request", { model, key: !!key });
    const client = new OpenAI({ apiKey: key });

    const oai = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    async function* makeIterator() {
      for await (const chunk of oai) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) yield encoder.encode(delta);
      }
    }
    const stream = new ReadableStream({
      async pull(controller) {
        const { value, done } = await (makeIterator() as any).next();
        if (done) controller.close();
        else controller.enqueue(value);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}