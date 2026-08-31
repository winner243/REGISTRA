# Architecture

Ce document décrit l'architecture **générale** du SaaS Starter V2. Elle est volontairement
**générique** et réutilisable : elle sert de fondation pour plusieurs futurs SaaS sans
être spécifique à un métier.

---

## Vue d'ensemble

```
Client navigateur
      │  (React / Next.js)
      ▼
┌─────────────────────────────┐        ┌──────────────────┐
│  Next.js App Router        │        │  Supabase       │
│  (src/app/, src/proxy.ts)  │ ─────▶ │  - Auth         │
└─────────────────────────────┘        │  - Base de données │
      │  Server Components /           └──────────────────┘
      │  Server Actions / Route Handlers
      ▼
      Validation Zod (src/lib/validation)
```

- **Frontend** : React + Next.js App Router, rendu serveur (Server Components) avec
  composants client quand l'interactivité l'exige.
- **Backend** : Server Actions, Route Handlers et Server Components du même projet —
  aucune API séparée n'est nécessaire à ce stade.
- **Data** : Supabase (auth + PostgreSQL), accédée via `@supabase/ssr`.

---

## Next.js

- **App Router** : organisation par groupes de routes dans `src/app/` :
  - `(marketing)/` — public : landing, pricing ;
  - `(auth)/` — login, register, forgot-password (redirige un utilisateur connecté) ;
  - `(app)/` — **protégé** : dashboard et sous-pages ;
  - `(reset)/` — reset-password ;
  - `auth/callback/` — échange de code d'autorisation contre une session.
- **Proxy** : `src/proxy.ts` (convention Next.js 16, anciennement `middleware`) gère le
  rafraîchissement de session.

## TypeScript

- Config **strict** (`tsconfig.json`, `"strict": true`).
- Alias `@/*` → `src/*`.
- Types explicites lorsque nécessaire ; `any` évité.

## Composants

- **shadcn/ui** dans `src/components/ui/` — composants de base du design system.
- **Layout** dans `src/components/layout/` — nav, sidebar, layout global.
- **États UI** réutilisables dans `src/components/states/` (Loading, Empty, Error,
  Success, Confirm, Unauthorized).
- **Auth** dans `src/components/auth/` — formulaires de connexion/inscription.

Règle : **réutiliser avant de créer** — chercher l'existant, le rendre configurable,
ne créer qu'en dernier recours.

## Séparation frontend / backend

- La **logique sensible** (auth, autorisation) est **côté serveur**
  (`src/lib/auth/`, `src/lib/supabase/server.ts`).
- Le **frontend n'est jamais** la frontière de sécurité : il ne fait qu'améliorer l'UX.
- **Validation** des entrées côté serveur via Zod (`src/lib/validation/`).

## Supabase

- `src/lib/supabase/client.ts` — client **navigateur**.
- `src/lib/supabase/server.ts` — client **serveur**.
- `src/lib/supabase/env.ts` — lecture centralisée des variables + `isSupabaseConfigured()`.
- Auth dans `src/lib/auth/actions.ts` (Server Actions).

## Organisation des dossiers

```
src/
├── app/
├── components/
├── config/          → brand.ts (branding)
├── data/            → données d'exemple statiques
└── lib/
    ├── auth/
    ├── supabase/
    ├── validation/
    └── utils.ts     → helper cn()
```

## Principes de réutilisation

- Une logique partagée → `src/lib/`.
- Un composant partagé → `src/components/`.
- Une donnée d'exemple → `src/data/`.
- Ne pas dupliquer : toute fonctionnalité doit chercher puis réutiliser l'existant.
