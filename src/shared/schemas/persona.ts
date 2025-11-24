import { z } from "zod";

export const PersonaInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  story: z.string().min(1),
  traits: z.array(z.string()).default([]),
  beliefs: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
  tags: z.array(z.string()).optional(),
  references: z.string().optional(),
  behaviors: z.string().optional(),
  challenges: z.string().optional(),
  responses: z.string().optional(),
  lessons: z.string().optional(),
  ownerUserId: z.string().optional(),
  visibility: z.enum(["public", "private"]).optional().default("private"),
});
