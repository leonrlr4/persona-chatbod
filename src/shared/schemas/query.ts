import { z } from "zod";

export const QueryInput = z.object({
  text: z.string().min(1).optional(),
  embedding: z.array(z.number()).optional(),
  k: z.number().int().min(1).max(20).default(5),
  index: z.string().default("vector_index"),
});