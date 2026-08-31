# Déploiement — Vercel

Ce document décrit la préparation du projet pour un déploiement **Vercel** à partir du
dépôt GitHub. Aucun déploiement n'a été lancé ici : la connexion GitHub → Vercel
nécessite une action manuelle de ta part.

---

## État actuel

- **Build compatible Vercel** : `next build` passe (avec ou sans `.env.local`).
- `next.config.ts` utilise la configuration standard Next.js → **aucun `vercel.json`
  nécessaire** (Next.js est détecté automatiquement par Vercel).
- Aucun secret n'est présent dans le dépôt Git.
- Commande de build Vercel : `next build` (détecté automatiquement depuis
  `package.json`).

---

## Variables d'environnement à configurer dans Vercel

À renseigner dans **Vercel → Settings → Environment Variables** (jamais dans le
code ni dans Git). Ce sont les **mêmes** que celles documentées dans
[`docs/supabase.md`](supabase.md) :

| Variable | Type | Usage |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Non-secret (publique) | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Non-secret (publique) | Clé **publishable** |
| *(futurs services)* | selon besoin | à ajouter au fil des phases |

> Ces valeurs sont de type **publiques** (`NEXT_PUBLIC_*`), elles sont embarquées dans
> le bundle navigateur. Tout ce qui doit rester **secret** (clés serveur, tokens) ne doit
> **jamais** avoir de préfixe `NEXT_PUBLIC_*`.

---

## Prérequis pour connecter GitHub → Vercel (action manuelle)

1. Pousse le dépôt sur GitHub (déjà fait : `winner243/saas-starter-v2`).
2. Crée/connecte ton compte **Vercel**.
3. **Import** le projet depuis ce dépôt GitHub.
4. Renseigne les variables d'environnement ci-dessus (Production + Preview).
5. Déploie (Preview puis Production).

À chaque push sur `main`, Vercel déclenchera un déploiement automatique. La CI
GitHub Actions vérifie lint / typecheck / test / build indépendamment.

---

## Règles

- Ne copie **jamais** les valeurs secrètes dans GitHub, le code source, les règles
  Cursor, `ci.yml` ou `README.md`.
- Ne pousse jamais de fichier `.env.local` (il est ignoré par `.gitignore`).
- Ne force jamais un push.
