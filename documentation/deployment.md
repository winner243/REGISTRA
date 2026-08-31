# Déploiement

Ce document décrit le flux de déploiement du SaaS Starter V2 et les environnements.

---

## Flux global

```
Développement local
      │  (pnpm dev)
      ▼
Git (commit + push)
      │  main
      ▼
GitHub (dépôt saas-starter-v2)
      │  push / PR
      ▼
CI — GitHub Actions
      (lint → typecheck → test → build)
      │  (si tout passe)
      ▼
Preview / Staging (Vercel)
      │  validation humaine
      ▼
Production (Vercel)
```

L'objectif est d'éviter qu'un code non validé atteigne la production.

---

## Variables d'environnement

| Variable | Local | Preview | Production |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Vercel (Preview) | Vercel (Production) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` | Vercel (Preview) | Vercel (Production) |

- Les valeurs `NEXT_PUBLIC_*` sont publiques (embarquées côté navigateur).
- Tout ce qui est **secret** doit être **côté serveur** et sans préfixe `NEXT_PUBLIC_*`.
- **Jamais** de valeur réelle dans le code, Git, `.env.example`, règles ou `ci.yml`.

## Environnements Vercel

Vercel fournit nativement **Production** et **Preview** (par PR/branch) :

- **Production** : branch `main`, vrais utilisateurs.
- **Preview** : généré à chaque push/PR, pour validation avant production.

Il n'est **pas nécessaire** de créer un système complexe : Vercel + Next.js gèrent
déjà ces environnements.

Étapes manuelles (à faire dans Vercel) :

1. Import du dépôt GitHub `winner243/saas-starter-v2`.
2. Configuration des variables d'environnement (Production + Preview).
3. Déploiement initial.

> Détails opérationnels : [`docs/vercel.md`](../docs/vercel.md).

---

## CI (GitHub Actions)

`.github/workflows/ci.yml` :

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

S'exécute sur push `main` et sur PR. N'importe quel échec bloque la validation.
