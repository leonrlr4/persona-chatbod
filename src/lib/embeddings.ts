import OpenAI from "openai";

export async function embedText(text: string) {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const dimEnv = Number(process.env.EMBEDDING_DIM || "0");
  const client = new OpenAI({ apiKey: key });
  const res = await client.embeddings.create({ model, input: text });
  const emb = res.data[0].embedding as number[];
  if (dimEnv && emb.length !== dimEnv) {
    throw new Error(`Embedding dimension mismatch: got ${emb.length}, expected ${dimEnv}`);
  }
  return emb;
}