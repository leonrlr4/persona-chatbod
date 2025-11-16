import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { ChatDeepSeek } from "@langchain/deepseek";

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

    const key = process.env.DEEPSEEK_API_KEY || "";
    if (!key) return NextResponse.json({ ok: false, error: "DEEPSEEK_API_KEY missing" }, { status: 500 });
    const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
    const llm = new ChatDeepSeek({ apiKey: key, model, temperature: 0.7 });

    const encoder = new TextEncoder();
    async function* makeIterator() {
      const stream = await llm.stream([
        ["system", systemPrompt],
        ["human", userText],
      ]);
      for await (const chunk of stream as any) {
        const c: any = (chunk && (chunk.content as any)) || "";
        const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((v: any) => (typeof v === "string" ? v : String(v?.text || ""))).join("") : "";
        if (text) yield encoder.encode(text);
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