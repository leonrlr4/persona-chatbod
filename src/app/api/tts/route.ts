import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const body = await req.json();
    const text: string = String(body?.text || "").trim();
    const lang: string = String(body?.lang || "").trim();
    const voice: string = String(body?.voice || "").trim();
    const speed: number = Number(body?.speed || 1);
    const format: string = String(body?.format || "wav");
    if (!text) {
      const res = NextResponse.json({ ok: false, error: "text missing" }, { status: 400 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    const endpoint = process.env.KOKORO_API_URL || "";
    if (!endpoint) {
      const res = NextResponse.json({ ok: false, error: "KOKORO_API_URL missing" }, { status: 501 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    const token = process.env.KOKORO_API_KEY || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const isHF = /huggingface\.co/.test(endpoint);
    const requestBody = isHF
      ? {
          inputs: text,
          parameters: { language: lang || undefined, voice: voice || undefined, speed: speed || undefined, output_format: format || "wav" },
          options: { wait_for_model: true },
        }
      : { text, lang, voice, speed, format };

    const r = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    if (!r.ok) {
      const res = NextResponse.json({ ok: false, error: `kokoro_${r.status}` }, { status: 500 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }
    const ct = r.headers.get("content-type") || "audio/wav";
    const stream = r.body;
    if (!stream) {
      const buf = await r.arrayBuffer();
      // DeepInfra 等服務可能回傳 JSON（含 base64 音訊）。
      if (ct.includes("application/json")) {
        const j = JSON.parse(Buffer.from(buf).toString("utf-8"));
        const audio: string | null = j?.audio || null;
        const fmt: string = String(j?.output_format || format || "wav");
        if (audio && typeof audio === "string") {
          let base64 = audio;
          let mime = `audio/${fmt || "wav"}`;
          const m = /^data:(.+?);base64,(.+)$/.exec(base64);
          if (m) { mime = m[1]; base64 = m[2]; }
          const data = Buffer.from(base64, "base64");
          const res = new Response(data, { headers: { "Content-Type": mime, "Cache-Control": "no-cache" } });
          res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
          return res;
        }
        const res = NextResponse.json(j);
        res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
        return res;
      }
      const res = new Response(Buffer.from(buf), { headers: { "Content-Type": ct, "Cache-Control": "no-cache" } });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    const res = new Response(stream as ReadableStream, { headers: { "Content-Type": ct, "Cache-Control": "no-cache" } });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  } catch (e: unknown) {
    const res = NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  }
}
