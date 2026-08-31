import { z } from "zod"

import { emailSchema, passwordSchema } from "@/lib/validation"

/** Connexion : email + mot de passe. */
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

/** Inscription : email + mot de passe + confirmation. */
export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  })

/** Demande de réinitialisation : email seul. */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

/** Nouveau mot de passe + confirmation. */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
