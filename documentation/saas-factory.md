# SaaS Factory — Créer un nouveau SaaS

Ce document définit le processus **officiel** pour créer un nouveau SaaS à partir du
SaaS Starter V2. Il explique comment réutiliser la fondation sans la casser, sans
copier ses secrets et sans la transformer en un SaaS métier.

> Le Starter reste une **fondation générique**. Ce document décrit comment le
> réutiliser, il ne crée aucun SaaS en particulier.

---

## Principe

```
SAAS STARTER (fondation générique)
      │
      ├──→ SaaS A (ex. location)
      ├──→ SaaS B (ex. PlanForge)
      ├──→ SaaS C (ex. Registra)
      └──→ autres…
```

Chaque futur SaaS est un **repository indépendant**, avec son **propre projet
Supabase**, ses **propres variables d'environnement**, son **propre branding**, ses
**propres tables/règles** et son **propre déploiement**. Les projets ne doivent
**jamais** dépendre les uns des autres.

---

## Processus officiel (étapes)

```
SAAS STARTER
      ↓ 1. Copier la fondation
Créer un nouveau repository
      ↓ 2. Cloner / copier la fondation
Nouveau projet Supabase
      ↓ 3. Créer le projet + projeter les variables
Nouvelles variables d'environnement
      ↓ 4. Configurer (jamais de valeurs réelles dans Git)
Nouveau branding
      ↓ 5. Adapter src/config/brand.ts + design tokens
Nouvelles tables / migrations
      ↓ 6. Créer supabase/migrations/ + RLS
Nouvelles règles RLS
      ↓ 7. Policies restrictives basées sur auth.uid()
Fonctionnalités métier
      ↓ 8. Séparer logique métier de l'UI générique
Tests
      ↓ 9. Vitest (unités) + Playwright (parcours)
CI
      ↓ 10. Réutiliser .github/workflows/ci.yml
Preview
      ↓ 11. Vercel Preview
Validation
      ↓ 12. Validation humaine
Production
      ↓ 13. Vercel Production
```

---

## Détail des étapes

### 1–2. Copier la fondation

- Créer un **nouveau repository** GitHub.
- Cloner la fondation sans l'historique (copie des fichiers source + config), ou
  brancher sur une copie propre.
- **Ne modifie pas** `saas-starter-v2` : il reste la référence générique.

### 3–4. Projet Supabase et variables

- Créer un **nouveau projet Supabase** (pas une réutilisation du projet du Starter,
  encore moins de sa production).
- Mettre les variables d'environnement **spécifiques au nouveau SaaS** :

| Variable | Côté |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | publique |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publique |
| *(secret serveur attendu : sans préfixe NEXT_PUBLIC_ \*, côté serveur uniquement)* | secret |

- Copier `.env.example` → `.env.local` en local, et configurer les valeurs dans
  **Vercel** pour Preview/Production.

### 5. Branding

- Adapter `src/config/brand.ts` (nom, description, tagline, logo, favicon).
- Ajuster les **design tokens** (couleurs, typographie) dans le CSS/theme.
- Les composants shadcn/ui, layouts, navbar et sidebar sont **réutilisables** tels
  quels.
- Ne crée pas un système de theming complexe : modifier `brand.ts` + tokens suffit.

### 6–7. Tables, migrations, RLS

- Créer les tables dans `supabase/migrations/` (versionnées) via la CLI Supabase.
- Activer **RLS** sur chaque table et définir des **policies restrictives**.
- Ne jamais exposer de clé privilégiée côté client ; la sécurité se joue dans la DB.

### 8. Fonctionnalités métier

- La logique métier est isolée (pas mélangée à l'UI générique).
- Utilise la structure existante : `src/lib/` pour la logique, `src/components/` pour
  l'UI réutilisable, `src/config/brand.ts` pour le branding spécifique.
- Ajoute des **schémas Zod** pour valider les entrées (réutilise et étends
  `src/lib/validation/`).

### 9–10. Tests et CI

- **Vitest** pour la logique/validation (réutilise le setup existant).
- **Playwright** pour les parcours utilisateur (à ajouter si besoin de tests E2E).
- Réutilise `.github/workflows/ci.yml` (l'intégration est déjà en place).

### 11–13. Déploiement

- **Vercel** gère Preview et Production automatiquement depuis Git.
- À chaque push, la CI (lint/typecheck/test/build) et Preview sont déclenchés.
- Reporter en Production **uniquement après validation** en Preview.

---

## Ce qui ne doit JAMAIS être copié aveuglément

⚠️ Ne jamais recopier depuis un autre projet :

- **secrets** (tokens, clés, mots de passe) ;
- **`.env.local`** (et tout fichier `.env*`) ;
- **données de production** ;
- **credentials** (clés service, accès) ;
- **anciens utilisateurs / comptes** ;
- **anciennes données métier** (tables et lignes).

Chaque nouveau SaaS repart avec de **nouvelles** valeurs de variables, un **nouveau**
projet Supabase (base vide), et de **nouvelles** données.

---

## Checklist « Nouveau SaaS » (réutilisable)

- [ ] Copier/cloner le Starter
- [ ] Créer le repository GitHub
- [ ] Créer le projet Supabase
- [ ] Configurer les variables d'environnement (env example → local → Vercel)
- [ ] Choisir le branding (`src/config/brand.ts` + tokens)
- [ ] Définir les fonctionnalités
- [ ] Concevoir les tables
- [ ] Créer les migrations (`supabase/migrations/`)
- [ ] Configurer RLS
- [ ] Définir les permissions / autorisations
- [ ] Créer les pages
- [ ] Créer les fonctionnalités métier (isolées de l'UI générique)
- [ ] Ajouter la validation Zod
- [ ] Ajouter les tests Vitest
- [ ] Ajouter les tests Playwright
- [ ] Vérifier la CI (`.github/workflows/ci.yml`)
- [ ] Configurer Preview (Vercel)
- [ ] Configurer Production (Vercel)
- [ ] Configurer le monitoring
- [ ] Configurer l'analytics
- [ ] Vérifier les backups
- [ ] Vérifier la sécurité
- [ ] Mettre à jour la documentation
- [ ] Déployer

---

## Validation de la réutilisabilité

Avant de livrer, vérifie la capacité à créer un second SaaS **complètement
différent** avec la même fondation, sans dépendance entre les projets :

- le branding est **paramétrable** ;
- l'architecture est **générique** (aucun couplage métier) ;
- le backend (Supabase) est **séparé** de la logique métier ;
- les tests, la CI et la documentation sont **réutilisables** ;
- aucun secret ni donnée d'un projet ne fuit dans un autre.
