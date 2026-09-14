# Bruno Collection — SaaS Starter V2

## Aperçu

Collection Bruno pour tester les API du projet **SaaS Starter V2** (Next.js 16 + Supabase Auth).

## Endpoints disponibles

### Route Handlers (REST)

| Méthode | Path | Description |
|---------|------|-------------|
| `GET` | `/auth/callback` | Callback Supabase (OAuth / confirmation email) |
| `GET` | `/api/sentry-test` | Diagnostic Sentry |

### Server Actions (protocole Next.js)

| Action | ID (build courant) | Page URL |
|--------|---------------------|----------|
| `login` | `60a204282119020ccbb93dd1c64c000af939475040` | `/login` |
| `signUp` | `60b7a2108a9717b9fd0aca8dba5744c9c802797d08` | `/register` |
| `forgotPassword` | `6013d7a13cdea4f7a8cf92b8076d08d0a4145f1727` | `/forgot-password` |
| `resetPassword` | `605a9ed23730e72f51d67407e26f83a0889d30e01c` | `/reset-password` |
| `signOut` | `00997f94c176f13721f4752b99334b66f8ec23435c` | `/dashboard` |

> **⚠️ Les action IDs changent à chaque rebuild.** Vérifiez les IDs dans
> `.next/server/server-reference-manifest.json` après chaque `pnpm build`
> ou redémarrage du dev server.

## Limitations des Server Actions

Les Server Actions Next.js ne sont **pas** des endpoints REST classiques :

- **Protocole** : POST avec header `Next-Action: <action-id>` et body Flight-encoded
- **Réponse** : format `text/x-component` (React Flight), pas du JSON
- **Redirect** : `redirect()` retourne un status 203 + header `x-action-redirect`
- **CSRF** : le header `Origin` doit matcher `Host`, ou être omis

### Ce que Bruno peut tester

| Aspect | Testable | Notes |
|--------|----------|-------|
| Validation Zod (400) | ✅ | Réponse Flight avec erreur encodée |
| Auth failures (401) | ✅ | Réponse Flight avec message d'erreur |
| Success / Redirect | ⚠️ | Status 200/203 + header `x-action-redirect` |
| Response body JSON | ❌ | Flight format, pas du JSON pur |
| Rate limiting (Server Actions auth) | ✅ | Limite `auth` via `assertRateLimit` (10 req / 60 s par IP) |

### Alternative recommandée

Pour des tests plus complets, utilisez la **méthode Supabase directe** (voir
`api/supabase-direct` dans cette collection) qui appelle l'API REST Supabase
avec des réponses JSON prévisibles.

## Setup

1. Ouvrir cette collection dans Bruno
2. Sélectionner l'environnement `dev` ou `prod`
3. Remplacer les variables dans `environments/*.bru`
4. Lancer le serveur : `pnpm dev`
5. Exécuter les requêtes

## Variables

| Variable | Description | Valeur |
|----------|-------------|--------|
| `base_url` | URL du serveur Next.js | `http://localhost:3000` |
| `supabase_url` | URL Supabase | Votre `NEXT_PUBLIC_SUPABASE_URL` |
| `supabase_anon_key` | Clé publique Supabase | Votre `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

## Sécurité

- **Jamais** de secrets dans les fichiers versionnés
- Utilisez les variables Bruno pour les clés API
- Les environments `prod.bru` ne doivent **jamais** être commités avec de vraies valeurs
