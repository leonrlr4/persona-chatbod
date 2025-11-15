import { z } from "zod";

export const UserSchema = z.object({
  _id: z.any().optional(),
  userId: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  passwordHash: z.string(),
  createdAt: z.number(),
  updatedAt: z.number()
});

export type UserDoc = z.infer<typeof UserSchema>;

export const RegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

export const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(8),
  remember: z.boolean().optional().default(false)
});

export const SessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
});

export type SessionDoc = z.infer<typeof SessionSchema>;

export const CsrfTokenSchema = z.object({
  token: z.string(),
});

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const PasswordResetApplySchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});