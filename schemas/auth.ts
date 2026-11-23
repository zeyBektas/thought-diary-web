import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  username: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => value || undefined),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => value || undefined),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
