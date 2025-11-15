export async function embedText(text: string) {
  const model = process.env.EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2";
  const dimEnv = Number(process.env.EMBEDDING_DIM || "384");
  
  try {
    // 使用 HuggingFace API
    const response = await fetch(
      `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          options: { wait_for_model: true }
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const embedding = await response.json() as number[];
    
    if (dimEnv && embedding.length !== dimEnv) {
      throw new Error(`Embedding dimension mismatch: got ${embedding.length}, expected ${dimEnv}`);
    }
    
    return embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    // 回退到隨機向量（用於開發測試）
    return Array.from({ length: dimEnv }, () => (Math.random() - 0.5) * 2);
  }
}

export const embeddings = {
  embedQuery: embedText,
  embedDocuments: async (texts: string[]) => {
    return Promise.all(texts.map(embedText));
  }
};