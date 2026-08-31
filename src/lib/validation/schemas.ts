import { z } from "zod"

/**
 * Schémas de validation génériques et réutilisables.
 *
 * La validation Zod sert à fiabiliser les entrées au moment du parsing.
 * Elle ne remplace JAMAIS ni l'authentification, ni l'autorisation : une
 * donnée valide ne signifie pas que l'utilisateur a le droit de l'utiliser.
 */

/** Adresse email simple mais stricte. */
export const emailSchema = z
  .string({ message: "Adresse email invalide." })
  .trim()
  .toLowerCase()
  .email({ message: "Adresse email invalide." })

/** Nom d'une personne ou d'une entité (texte lisible). */
export const nameSchema = z
  .string({ message: "Le nom est requis." })
  .trim()
  .min(2, { message: "Le nom doit contenir au moins 2 caractères." })
  .max(120, { message: "Le nom est trop long (120 caractères max)." })

/**
 * Prix strictement positif.
 * Générique : ne dépend d'aucune devise ni modèle métier.
 */
export const priceSchema = z
  .number({ message: "Le prix doit être un nombre." })
  .positive({ message: "Le prix doit être strictement positif." })
  .finite({ message: "Le prix doit être un nombre fini." })

/**
 * Numéro de téléphone.
 * Forme la plus générale possible (international) sans imposer de pays :
 * 6 à 20 chiffres avec séparateurs et préfixe "+" optionnels.
 */
export const phoneSchema = z
  .string({ message: "Le téléphone est requis." })
  .trim()
  .regex(/^\+?[0-9][0-9\s().-]{5,19}$/, {
    message: "Numéro de téléphone invalide.",
  })
  .max(20, { message: "Numéro de téléphone trop long." })

/** Mot de passe : longueur minimale uniquement (pas de règle de force arbitraire ici). */
export const passwordSchema = z
  .string({ message: "Le mot de passe est requis." })
  .min(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  .max(128, { message: "Le mot de passe est trop long." })

/** Profil utilisateur générique (exemple composé, réutilisable). */
export const userProfileSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
})

export type Email = z.infer<typeof emailSchema>
export type Name = z.infer<typeof nameSchema>
export type Price = z.infer<typeof priceSchema>
export type Phone = z.infer<typeof phoneSchema>
export type Password = z.infer<typeof passwordSchema>
export type UserProfile = z.infer<typeof userProfileSchema>
