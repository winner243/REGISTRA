# SaaS Starter V2

Base **générique et réutilisable** pour créer des SaaS avec Next.js, TypeScript,
Tailwind CSS, shadcn/ui et Supabase. Ce projet est une **fondation**, pas un produit :
il ne contient aucune logique métier spécifique, afin de servir de point de départ pour
plusieurs futurs SaaS.

## Table des matières

1. [Présentation](#présentation)
2. [Stack technique](#stack-technique)
3. [Prérequis](#prérequis)
4. [Installation](#installation)
5. [Variables d'environnement](#variables-denvironnement)
6. [Développement local](#développement-local)
7. [Tests](#tests)
8. [Build](#build)
9. [GitHub Actions](#github-actions)
10. [Environnements](#environnements)
11. [Supabase](#supabase)
12. [Monitoring](#monitoring)
13. [Analytics](#analytics)
14. [Déploiement Vercel](#déploiement-vercel)
15. [Structure du projet](#structure-du-projet)
16. [Sécurité](#sécurité)
17. [Sauvegardes](#sauvegardes)
18. [Contribution / workflow Git](#contribution--workflow-git)
19. [Créer un nouveau SaaS (SaaS Factory)](#créer-un-nouveau-saas-saas-factory)

---

## Présentation

Ce Starter fournit les fondations UX et d'infrastructure classiques d'un SaaS :

- pages publiques (landing, pricing) ;
- authentification email/mot de passe (inscription, connexion, oubli, réinitialisation) ;
- dashboard protégé et sous-pages (account, profile, billing, settings) ;
- gestion des états UI (loading, empty, error, unauthorized, not-found) ;
- validation des entrées (Zod) côté serveur ;
- architecture d'environnements Development / Preview / Production.

Documentation complète dans le dossier [`documentation/`](documentation/) et
[`docs/`](docs/).

---

## Stack technique

- **Next.js 16** (App Router) — `src/app/`
- **TypeScript** (strict)
- **Tailwind CSS 4**
- **shadcn/ui** — composants dans `src/components/ui/`
- **Supabase** — auth + base de données (`@supabase/ssr`)
- **Zod** — validation de schémas
- **Vitest** — tests unitaires
- **GitHub Actions** — CI
- **pnpm** — gestionnaire de paquets

---

## Prérequis

- **Node.js** ≥ 20.9 (untested recommandé : 24)
- **pnpm** ≥ 9 (le projet est verrouillé sur `pnpm@11.24.0`)
- un compte **Supabase** (ou l'extension docker) pour l'auth et la base
- éventuellement un compte **GitHub** et **Vercel** pour le déploiement

---

## Installation

> Ce projet utilise **pnpm**. N'utilise pas npm/yarn pour le lockfile.

```bash
pnpm install
```

Copie le fichier d'exemple puis renseigne tes valeurs **locales** :

```bash
cp .env.example .env.local
```

`install` respecte le lockfile : en CI, on utilise `pnpm install --frozen-lockfile`.

---

## Variables d'environnement

Variables publiques (embarquées côté navigateur **et** disponibles côté serveur) :

| Variable | Usage |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé **publishable** Supabase |

Règles :

- `.env.local` ne doit **jamais** être commité (ignoré par `.gitignore`).
- `.env.example` ne contient que des **noms** de variables, jamais de vraies valeurs.
- Un secret (clé serveur, token) ne doit **jamais** porter un préfixe `NEXT_PUBLIC_`.
- Les valeurs réelles sont à configurer dans :
  - `.env.local` pour le développement local ;
  - **Vercel** (Production / Preview) pour le déploiement.

---

## Développement local

```bash
pnpm dev
```

Ouvre [http://localhost:3000](http://localhost:3000). Le proxy de session est
géré par `src/proxy.ts` (convention Next.js 16).

---

## Tests

Tests unitaires avec **Vitest** :

```bash
pnpm test
```

Les tests couvrent la logique de validation et les schémas auth
(`src/lib/**/*.test.ts`).

---

## Build

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # next build
```

Le build fonctionne avec ou sans `.env.local` : les routes sont pré-rendues ou
rendues à la demande selon le besoin.

---

## GitHub Actions

Le workflow `.github/workflows/ci.yml` s'exécute sur **push** vers `main` et sur
**pull request** :

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

La CI échoue si une de ces étapes échoue. Aucun secret n'est requis (les valeurs
`NEXT_PUBLIC_*` sont optionnelles pour l'étape build).

---

## Environnements

| Environnement | But | Configure les variables dans |
| --- | --- | --- |
| **Development** | développement local | `.env.local` |
| **Preview / Staging** | validation avant production | Vercel → variables Preview |
| **Production** | vrais utilisateurs | Vercel → variables Production |

Principes :

- **ne jamais mélanger** les données de développement et de production (projets
  Supabase distincts, bases distinctes) ;
- **jamais** de clé/secret de production dans le code ;
- le pipeline est : dev → tests → preview → validation → production.

> Détails : [`docs/vercel.md`](docs/vercel.md) et
> [`documentation/deployment.md`](documentation/deployment.md).

---

## Supabase

Dépendances déjà installées : `@supabase/supabase-js`, `@supabase/ssr`.

- `src/lib/supabase/client.ts` — client navigateur.
- `src/lib/supabase/server.ts` — client serveur (Server Components, Route Handlers,
  Server Actions).
- `src/lib/supabase/env.ts` — centralise la lecture des variables et fournit
  `isSupabaseConfigured()`.
- Auth pilotée côté serveur dans `src/lib/auth/actions.ts`.
- Protection des routes côté serveur via `requireUser()` dans le layout
  `(app)`.

Le Starter est **générique** : aucune table métier, aucune policy RLS arbitraire.
La structure des données et les policies sont à définir par chaque futur SaaS.

> Détails : [`docs/supabase.md`](docs/supabase.md) — RLS, sessions, migrations.

---

## Monitoring

Sentry n'est **pas encore installé** (aucun DSN fourni). L'intégration recommandée
et les étapes manuelles sont documentées dans
[`documentation/security.md`](documentation/security.md) et
[`docs/monitoring.md`](docs/monitoring.md).

Ne mets jamais de DSN dans le code : il se configure via la variable
d'environnement **côté serveur**.

---

## Analytics

Aucun fournisseur analytics n'est imposé. Une **architecture réutilisable** est
documentée dans [`documentation/analytics.md`](documentation/analytics.md) : événements
clairement nommés, fonctions réutilisables, respect de la confidentialité, fournisseur
remplaçable.

---

## Déploiement Vercel

Le projet est compatible Vercel avec la configuration Next.js standard (aucun
`vercel.json` requis). Étapes :

1. push du dépôt GitHub ;
2. import du dépôt dans **Vercel** ;
3. configuration des variables d'environnement (Production + Preview) ;
4. déploiement.

À chaque push sur `main`, Vercel déclenche un déploiement automatique, tandis que la
CI GitHub Actions vérifie lint / typecheck / test / build.

> Détails : [`docs/vercel.md`](docs/vercel.md).

---

## Structure du projet

```
src/
├── app/                    # Routes Next.js App Router
│   ├── (marketing)/        #   public : landing, pricing
│   ├── (auth)/             #   login, register, forgot-password
│   ├── (app)/              #   dashboard + sous-pages (protégé)
│   ├── (reset)/            #   reset-password
│   └── auth/callback/      #   callback OAuth / email
├── components/
│   ├── ui/                 #   composants shadcn/ui
│   ├── layout/             #   layout global (nav, sidebar…)
│   ├── states/             #   États UI réutilisables
│   ├── auth/               #   formulaires d'authentification
│   └── dashboard/ settings/
├── config/
│   └── brand.ts            #   branding configurable
├── data/                   #   données d'exemple statiques
└── lib/
    ├── auth/               #   actions et session (serveur)
    ├── supabase/           #   clients + env
    ├── validation/         #   schémas Zod + erreurs
    └── utils.ts            #   helper cn()
```

---

## Sécurité

Principes fondamentaux :

- le **frontend n'est pas une frontière de sécurité** ;
- la **validation des entrées** et l'**autorisation** se font côté serveur ;
- **authentification ≠ autorisation** ;
- aucun secret dans le code, `.env.example` contient uniquement des noms ;
- `.env.local` et tout fichier `.env*` sont ignorés par Git.

> Détails : [`documentation/security.md`](documentation/security.md) et
> [`docs/supabase.md`](docs/supabase.md) (RLS).

---

## Sauvegardes

La stratégie de sauvegarde Supabase est documentée (ce qui doit être sauvegardé, où
vérifier, comment tester une restauration) dans
[`docs/backups.md`](docs/backups.md).

Le Starter ne lance **aucune** opération destructive : un test de restauration
nécessite une action manuelle de ta part sur le tableau de bord Supabase.

---

## Contribution / workflow Git

- Le dépôt est **saas-starter-v2** (remote `origin`).
- Branche par défaut : `main`.
- **jamais** de `git push --force` ;
- **jamais** de secret dans un commit ;
- ne pas toucher à **saas-starter-v1** (dépôt séparé) ;
- chaque modification passe par lint → typecheck → test → build.

---

## Créer un nouveau SaaS (SaaS Factory)

Ce Starter est une **fondation réutilisable** : il permet de créer plusieurs SaaS
indépendants (location, PlanForge, Registra…), chacun avec son propre branding, son
propre projet Supabase, ses propres variables et son propre déploiement.

Le processus officiel et la checklist complète sont documentés dans
[`documentation/saas-factory.md`](documentation/saas-factory.md).

**Principes clés :**

- chaque nouveau SaaS est un **repository indépendant** avec un **projet Supabase
  distinct** ;
- on **réutilise** la fondation (UI, auth, validation, tests, CI) mais pas les
  secrets, données, credentials ni utilisateurs ;
- le Starter reste générique : on ne le transforme pas en un SaaS métier.

---

## Références documentaires

| Sujet | Fichier |
| --- | --- |
| **Créer un nouveau SaaS** | [`documentation/saas-factory.md`](documentation/saas-factory.md) |
| Architecture | [`documentation/architecture.md`](documentation/architecture.md) |
| Base de données | [`documentation/database.md`](documentation/database.md) |
| Sécurité | [`documentation/security.md`](documentation/security.md) |
| Déploiement | [`documentation/deployment.md`](documentation/deployment.md) |
| Décisions techniques | [`documentation/decisions.md`](documentation/decisions.md) |
| Supabase | [`docs/supabase.md`](docs/supabase.md) |
| Vercel | [`docs/vercel.md`](docs/vercel.md) |
| MCP | [`docs/mcp.md`](docs/mcp.md) |
| Monitoring | [`docs/monitoring.md`](docs/monitoring.md) |
| Analytics | [`docs/analytics.md`](docs/analytics.md) |
| Sauvegardes | [`docs/backups.md`](docs/backups.md) |
