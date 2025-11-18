import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const body = await req.json();
    const text: string = String(body?.text || "").trim();
    let lang: string = String(body?.lang || "").trim();
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
    if (isHF && !token) {
      const res = NextResponse.json({ ok: false, error: "HUGGINGFACE_TOKEN missing" }, { status: 501 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    function mapLang(s: string) {
      const v = (s || "").toLowerCase();
      if (!v) return "";
      if (v.startsWith("zh")) return "z";
      if (v.startsWith("en-gb")) return "b";
      if (v.startsWith("en")) return "a";
      if (v.startsWith("fr")) return "f";
      if (v.startsWith("es")) return "e";
      if (v.startsWith("pt")) return "p";
      if (v.startsWith("ja") || v === "jp") return "j";
      if (v.startsWith("hi")) return "h";
      if (v.startsWith("it")) return "i";
      return v;
    }
    lang = mapLang(lang);

    function defaultVoiceByLang(l: string) {
      const x = (l || "").toLowerCase();
      if (x === "z") return "zf_xiaoxiao";
      if (x === "a" || x === "b") return "af_heart";
      if (x === "j") return "jf_alpha";
      if (x === "f") return "ff_siwis";
      if (x === "i") return "if_sara";
      return "";
    }
    const effectiveVoice = voice || defaultVoiceByLang(lang);

    const requestBody = isHF
      ? {
          inputs: text,
          parameters: { language: lang || undefined, voice: effectiveVoice || undefined, speed: speed || undefined, output_format: format || "wav" },
          options: { wait_for_model: true },
        }
      : { text, lang, voice: effectiveVoice, speed, format };

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

    const res = new Response(stream as any, { headers: { "Content-Type": ct, "Cache-Control": "no-cache" } });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  } catch (e: any) {
    const res = NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  }
}