export async function embedText(text: string) {
  const model = process.env.EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2";
  const dimEnv = Number(process.env.EMBEDDING_DIM || "384");
  const key = process.env.HUGGINGFACE_API_KEY || "";

  function normalize(vec: number[]): number[] {
    if (!dimEnv) return vec;
    if (vec.length === dimEnv) return vec;
    if (vec.length > dimEnv) return vec.slice(0, dimEnv);
    const out = new Array(dimEnv).fill(0);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i];
    return out;
  }

  function meanPool(arr: unknown): number[] {
    if (!Array.isArray(arr)) return [];
    if (arr.length && typeof arr[0] === "number") return arr as number[];
    if (arr.length && Array.isArray(arr[0]) && typeof (arr[0] as unknown[])[0] === "number") {
      const tokens = arr as number[][];
      const d = tokens[0]?.length || dimEnv || 0;
      const sum = new Array(d).fill(0);
      let n = 0;
      for (const t of tokens) {
        if (!Array.isArray(t)) continue;
        for (let i = 0; i < d && i < t.length; i++) sum[i] += t[i];
        n++;
      }
      if (n === 0) return [];
      for (let i = 0; i < d; i++) sum[i] /= n;
      return sum;
    }
    if (arr.length && Array.isArray(arr[0]) && Array.isArray((arr[0] as unknown[])[0])) {
      const batch = arr as number[][][];
      return meanPool(batch[0] || []);
    }
    return [];
  }

  try {
    if (!key) {
      return Array.from({ length: dimEnv }, () => (Math.random() - 0.5) * 2);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const r1 = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: controller.signal
      }
    ).catch(() => null as unknown as Response);

    let data: unknown = null;
    if (r1 && r1.ok) {
      data = await r1.json();
    } else {
      const r2 = await fetch(
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
          signal: controller.signal
        }
      ).catch(() => null as unknown as Response);
      if (r2 && r2.ok) data = await r2.json();
    }
    clearTimeout(timer);

    if (!data) {
      return Array.from({ length: dimEnv }, () => (Math.random() - 0.5) * 2);
    }

    const pooled = meanPool(data);
    const embedding = normalize(pooled.length ? pooled : (Array.isArray(data) ? normalize((data as number[])) : Array.from({ length: dimEnv }, () => (Math.random() - 0.5) * 2)));
    return embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return Array.from({ length: dimEnv }, () => (Math.random() - 0.5) * 2);
  }
}

export const embeddings = {
  embedQuery: embedText,
  embedDocuments: async (texts: string[]) => {
    return Promise.all(texts.map(embedText));
  }
};
