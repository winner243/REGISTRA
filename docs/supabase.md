# Supabase — Fondation réutilisable

Ce document décrit la fondation Supabase du SaaS Starter V2. Elle est volontairement
**générique** : elle ne contient aucune table métier ni aucune logique spécifique à un
SaaS en particulier. Chaque futur SaaS apportera son propre modèle de données et ses
propres policies RLS.

---

## Sommaire

- [Installation](#installation)
- [Variables d'environnement](#variables-denvironnement)
- [Client navigateur](#client-navigateur)
- [Client serveur](#client-serveur)
- [Authentification](#authentification)
- [Sessions](#sessions)
- [Routes protégées](#routes-protégées)
- [RLS — Row Level Security](#rls--row-level-security)
- [Migrations](#migrations)
- [Sécurité](#sécurité)
- [Modèles de SaaS supportés](#modèles-de-saas-supportés)

---

## Installation

Les packages nécessaires sont déjà installés :

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- `@supabase/supabase-js` — client Supabase (requêtes, auth).
- `@supabase/ssr` — intégration officielle pour Next.js App Router (gestion des
  cookies de session).

> N'ajoute aucune autre dépendance Supabase sans vérifier qu'elle est réellement
> nécessaire et compatible avec la version de Next.js utilisée.

---

## Variables d'environnement

Variables publiques (client navigateur **et** serveur) :

| Variable | Usage |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé **publishable** (côté client et serveur) |

Copie le fichier d'exemple puis renseigne tes valeurs **localement** :

```bash
cp .env.example .env.local
```

- `.env.local` **ne doit jamais** être commité (il est ignoré par `.gitignore`).
- `.env.example` ne contient que des noms de variables, jamais de secrets réels.

> ⚠️ La `SUPABASE_SERVICE_ROLE_KEY` (clé serveur sensible) ne doit **jamais**
> apparaître dans une variable `NEXT_PUBLIC_*`, ni dans du code exécuté dans le
> navigateur. Si elle est requise (tâches administrateur en backend), elle reste
> strictement côté serveur. Ce Starter ne l'utilise pas par défaut.

---

## Client navigateur

`src/lib/supabase/client.ts` — crée un client pour le **navigateur** via
`createBrowserClient` de `@supabase/ssr`.

- Préfixe `"use client"`.
- Destiné aux composants client (hooks, formulaires).
- Utilise la clé **publishable** uniquement.
- Retourne `null` si Supabase n'est pas configuré.

```ts
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const supabase = createSupabaseBrowserClient()
if (supabase) {
  const { data } = await supabase.from("ma_table").select("*")
}
```

---

## Client serveur

`src/lib/supabase/server.ts` — crée un client pour le **serveur** via
`createServerClient` de `@supabase/ssr`.

- Lisible dans les Server Components, Route Handlers et Server Actions.
- Lit les cookies de session avec `cookies()` de `next/headers`.
- Toute vérification d'autorisation sensible doit passer par ce client.

`src/lib/supabase/env.ts` — centralise la lecture des variables d'environnement et
fournit `isSupabaseConfigured()` (pour désactiver élégamment les fonctionnalités quand
Supabase n'est pas configuré).

---

## Authentification

L'authentification est **modulaire** et pilotée côté **serveur** dans
`src/lib/auth/actions.ts` (Server Actions). Aucune logique d'auth sensible n'est
déléguée au navigateur.

Fonctions disponibles :

- `signUp` — création de compte (gère la confirmation email si activée).
- `login` — connexion email / mot de passe.
- `forgotPassword` — envoi d'un lien de réinitialisation.
- `resetPassword` — mise à jour du mot de passe.
- `signOut` — déconnexion.

Les formulaires correspondants sont dans `src/components/auth/`.

Le lien de confirmation email et les redirections OAuth passent par la route de
callback `src/app/auth/callback/route.ts`, qui échange le code d'autorisation contre
une session (`exchangeCodeForSession`) puis redirige vers `/dashboard`.

---

## Sessions

`src/lib/auth/session.ts` propose :

- `getCurrentUser()` : retourne l'utilisateur connecté (vérifié **côté serveur**
  via `auth.getUser()`), ou `null`.
- `requireUser()` : redirige vers `/login` si aucun utilisateur.
- `isAuthenticated()` : retourne un booléen.

Le rafraîchissement de session (cookies) est géré par **le proxy**
`src/proxy.ts` (convention Next.js 16, anciennement `middleware`), qui met à jour la
session si le jeton a expiré.

> Utilise toujours `getUser()` côté serveur pour fiabiliser l'identité. Ne te fie pas
> uniquement à un JWT décodé côté client.

---

## Routes protégées

La **protection se fait côté serveur**, jamais seulement en cachant un bouton dans
l'interface.

Le layout `src/app/(app)/layout.tsx` appelle `requireUser()` : toute route placée dans
ce groupe nécessite une session valide et redirige vers `/login` sinon.

Les groupes de routes de ce Starter :

| Groupe | Accès |
| --- | --- |
| `(marketing)` | **Public** — page d'accueil, pricing |
| `(auth)` | Public (redirige un utilisateur déjà connecté vers `/dashboard`) |
| `(app)` | **Protégé** — dashboard et sous-pages |
| `(reset)` | Public — réinitialisation de mot de passe |

---

## RLS — Row Level Security

### Principe

Le frontend n'est **jamais** la frontière de sécurité. La sécurité se joue au niveau
de la base de données :

```
Frontend → Supabase → RLS → autorisation au niveau DB
```

RLS restreint les lignes qu'un utilisateur peut lire/écrire selon son identité
(`auth.uid()`), même si le client est compromis.

### Le Starter est générique

Ce Starter ne crée **aucune table métier** et n'applique **aucune policy** arbitraire.
Chaque futur SaaS devra activer RLS et définir ses policies table par table.

### Patterns recommandés (à adapter à chaque table)

| Rôle / contexte | Accès recommandé |
| --- | --- |
| **PUBLIC** | `SELECT` uniquement sur les données explicitement publiques |
| **AUTHENTICATED USER** | accès à ses propres lignes (`auth.uid() = owner`) |
| **ADMIN / OWNER** | accès aux ressources dont il a l'autorisation |
| **AUTRES utilisateurs** | aucun accès non autorisé |

### Règles de sécurité

- Ne crée **jamais** de policy `FOR ALL USING (true)` sauf pour une donnée
  strictement publique, et documente alors précisément pourquoi.
- Réfléchis séparément à `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Active RLS sur chaque table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- Utilise les roles Supabase (`anon`, `authenticated`, `service_role`) avec
  parcimonie.

---

## Migrations

La base est **générique** : seules les extensions, les helpers et la table de
fondation `profiles` existent. Chaque futur SaaS apportera son propre modèle et ses
propres migrations.

Structure : `supabase/config.toml` (dev local) + `supabase/migrations/` (fichiers
SQL **versionnés**, ordonnés par timestamp, idempotents).

```bash
pnpm dlx supabase start         # démarre la base locale (Docker)
pnpm dlx supabase db push       # applique les migrations locales
# ou, en CI / production :
pnpm dlx supabase db push --remote
```

À chaque modification de schéma — **toujours par migration**, jamais en direct :

1. Crée un fichier `supabase/migrations/<timestamp>_description.sql`.
2. Teste (base locale, et job CI `db-migrations` sur base PostgreSQL vierge).
3. Applique (`db push`) puis commit le fichier de migration.

Règles détaillées (intégrité, indexes, relations, RLS, timestamps, soft delete) :
[`documentation/database.md`](../documentation/database.md).

Ne crée pas ici de base métier arbitraire « pour tester » : le Starter reste
générique.

---

## Sécurité

- `.env.local` / `.env` / `.env.*.local` sont ignorés par `.gitignore` ; seul
  `.env.example` est versionné.
- Aucun secret n'est présent dans le dépôt.
- La clé `service_role` n'est **pas** utilisée dans le frontend.
- La vérification d'accès se fait côté serveur + RLS (jamais seulement côté UI).
- Ne mets jamais de clé serveur dans une variable `NEXT_PUBLIC_*`.

### Risques résiduels (à traiter par le futur SaaS)

- Les policies RLS réelles dépendent du modèle métier : à définir rigoureusement
  table par table.
- La clé `publishable` est publique par nature : la sécurité des données repose sur
  les policies RLS, pas sur la clé.
- Si un flux administrateur nécessite un compte de service, il doit être isolé côté
  serveur et soumis à des revues.

---

## Modèles de SaaS supportés

La fondation est conçue pour supporter plusieurs modèles **sans reconstruire
l'architecture** :

### Modèle A — SaaS classique

Authentification obligatoire pour accéder au produit.

```
Visiteur → Login/Register → Dashboard
```

Le groupe `(app)` (protégé) suffit ; le marketing `(marketing)` est public.

### Modèle B — Marketplace / location

Consultation publique **sans compte obligatoire**, administration protégée.

```
VISITEUR → Accueil → Recherche → Voir les propriétés → Contact/demande
ADMIN → Login → Dashboard → Gestion des propriétés
```

Les pages de consultation sont publiques (groupe marketing ou routes dédiées) ; seules
les pages d'administration sont protégées (groupe `(app)`).

### Modèle C — Hybride

Certaines fonctionnalités publiques, d'autres protégées.

```
Visiteur     → Consultation publique
Utilisateur  → Compte facultatif
Admin        → Compte obligatoire
```

Le Starter permet de rendre **chaque route** publique ou protégée indépendamment selon
le besoin, en plaçant la route dans le groupe approprié ou en appelant
`requireUser()` au niveau souhaité.
