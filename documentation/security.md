# Sécurité

Ce document décrit les principes de sécurité du SaaS Starter V2 et les règles à
respecter dans tout le code et la configuration.

---

## Principes fondamentaux

Trois distinctions essentielles :

> **Frontend ≠ frontière de sécurité**

> **Validation ≠ autorisation**

> **Authentification ≠ autorisation**

- Le navigateur est un environnement non fiable : on ne se fie jamais à lui pour une
  décision de sécurité.
- L'autorisation se vérifie **côté serveur** **et** au niveau de la **base (RLS)**.

---

## Secrets et variables d'environnement

- Aucun secret dans le code source.
- `.env.local` (et tout `.env*`) est ignoré par `.gitignore` — jamais commité.
- `.env.example` ne contient que des **noms** de variables, jamais de valeurs.
- Un secret (clé serveur, token) ne porte **jamais** de préfixe `NEXT_PUBLIC_*`.
- La clé `service_role` n'est **jamais** exposée côté navigateur.

## Validation des entrées

- Les données venant du client ne sont **jamais fiables**.
- Validation **côté serveur** (Zod : `src/lib/validation/`).
- Le frontend peut améliorer l'UX, mais il ne remplace pas la validation serveur.

## Authentification

- Pilotée **côté serveur** (`src/lib/auth/actions.ts`, Server Actions).
- Sessions gérées par `@supabase/ssr` + `src/proxy.ts`.
- Vérification d'identité via `auth.getUser()` côté serveur
  (`src/lib/auth/session.ts`).
- L'authentification établit **qui** est l'utilisateur ; elle ne dit pas **ce qu'il a
  le droit de faire**.

## Autorisation

- Se fait **côté serveur** (ex. `requireUser()` dans le layout `(app)`) **et** dans la
  base via **RLS**.
- Jamais seulement en masquant un bouton dans l'interface.

## RLS (Row Level Security)

- Chaque table protégée, policies restrictives basées sur `auth.uid()`.
- Le frontend n'est jamais la frontière : la base autorise ou refuse.

## Git et CI

- Jamais de secret dans un commit.
- Jamais de `git push --force`.
- CI (`ci.yml`) exécute lint, typecheck, test, build — échoue si l'un échoue.
- Ne pas toucher à **saas-starter-v1**.

## Monitoring

- Si une erreur applicative est remontée (Sentry), respecter la **confidentialité** :
  ne jamais collecter mots de passe, tokens, clés, données sensibles ou PII
  non nécessaires.
- Un DSN est un secret **côté serveur** : il se configure via variable
  d'environnement et ne doit pas apparaître dans le code, Git, `.env.example`,
  les règles ou `ci.yml`.
- Pour les source maps Sentry en CI, ajouter `SENTRY_ORG`, `SENTRY_PROJECT`
  et `SENTRY_AUTH_TOKEN` (jamais exposé côté client).

## Headers de sécurité

Tous les headers sont configurés dans `next.config.ts` :

- `X-Frame-Options: DENY` — anti-clickjacking
- `X-Content-Type-Options: nosniff` — anti-MIME-sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Content-Security-Policy-Report-Only` — policy permissive progressive (pas
  de blocage, collecte des violations pour durcissement ultérieur)

## Content Security Policy (CSP)

Le CSP est en mode **Report-Only** : il ne bloque rien mais identifie les
sources nécessaires. Après analyse des rapports de violations, une CSP
restrictive sera mise en place avec des nonces pour les scripts/styles inline.

## Rate limiting

Le rate limiting utilise un store en mémoire (`MemoryRateLimitStore`),
adapté au développement et aux instances uniques. En serverless
multi-instances (Vercel), le quota est par instance. Un store distribué
(Redis/Upstash/table Supabase) pourra être ajouté via l'interface
`RateLimitStore` sans changer les appelants — voir `docs/rate-limiting.md`.

> Détails opérationnels : [`docs/supabase.md`](../docs/supabase.md),
> [`docs/backups.md`](../docs/backups.md), [`docs/rate-limiting.md`](../docs/rate-limiting.md).
