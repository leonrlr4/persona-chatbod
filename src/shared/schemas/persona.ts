import { z } from "zod";

export const PersonaInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  story: z.string().min(1),
  traits: z.array(z.string()).default([]),
  beliefs: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
});