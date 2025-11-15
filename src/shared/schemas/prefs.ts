import { z } from "zod";

export const PrefsSchema = z.object({
  userId: z.string().min(1),
  language: z.enum(["zh", "en"]).default("zh"),
  vadThreshold: z.number().min(0).max(1).default(0.5),
  noiseSuppression: z.boolean().default(true),
  echoCancellation: z.boolean().default(true),
  personaId: z.string().optional(),
});