import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const hfToken = process.env.HUGGINGFACE_API_KEY || "";
    const model = process.env.STT_MODEL || "openai/whisper-large-v3";
    if (!hfToken) {
      const res = NextResponse.json({ ok: false, error: "HUGGINGFACE_API_KEY missing" }, { status: 500 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }

    const fd = await req.formData();
    const file = fd.get("file");
    if (!file || typeof file === "string") {
      const res = NextResponse.json({ ok: false, error: "file missing" }, { status: 400 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }
    const type = (file as File).type || "audio/webm";
    const bytes = Buffer.from(await (file as File).arrayBuffer());

    const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": type },
        body: bytes,
      }
    );
    if (!r.ok) {
      const res = NextResponse.json({ ok: false, error: `hf_${r.status}` }, { status: 500 });
      res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
      return res;
    }
    const data = await r.json();
    const text = String(data?.text || "");
    const res = NextResponse.json({ ok: true, text });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  } catch (e: any) {
    const res = NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    res.headers.set("Server-Timing", `app;dur=${Date.now()-t0}`);
    return res;
  }
}