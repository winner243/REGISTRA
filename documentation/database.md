# Base de données

Ce document décrit le rôle de **Supabase** dans le SaaS Starter V2 et les règles à
respecter pour la base de données et la sécurité des données.

---

## Rôle de Supabase

Supabase fournit deux briques au Starter :

1. **Authentification** — gestion des utilisateurs, sessions, confirmation email,
   réinitialisation de mot de passe.
2. **Base de données PostgreSQL** — stockage des données applicatives.

Le Starter est **générique** : il n'a **aucune table métier** ni policy arbitraire.
Chaque futur SaaS définira son propre modèle de données.

---

## Organisation générale

- Clients réutilisables :
  - `src/lib/supabase/client.ts` — navigateur (clé **publishable** uniquement) ;
  - `src/lib/supabase/server.ts` — serveur (Server Components, Route Handlers,
    Server Actions) ;
  - `src/lib/supabase/env.ts` — lecture centralisée des variables environnement,
    `isSupabaseConfigured()`.
- La vérification d'accès sensible se fait **côté serveur** + **RLS**.

## Migrations

- Toute modification de schéma passe par une **migration versionnée** (fichiers SQL
  dans `supabase/migrations/`) appliquée avec la CLI Supabase.
- Aucun changement de schéma ad hoc dans le code applicatif.
- Puis `supabase db push` pour appliquer.

## RLS — Row Level Security

- Le **frontend n'est pas** la frontière de sécurité : c'est la base qui autorise.
- Toute nouvelle table doit être protégée par **RLS**
  (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- Policies les plus restrictives possibles, en utilisant `auth.uid()` et l'ownership.
- Réfléchir séparément à `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Pas de policy `FOR ALL USING (true)` sauf donnée strictement publique et documentée.

## Règles de sécurité

- **Moindre privilège** : jamais de clé `service_role` côté navigateur.
- La clé **publishable** est publique par nature ; la sécurité repose sur les policies
  RLS, pas sur la clé.
- Validation des entrées **côté serveur** avant tout accès/écriture.

## Distinction développement / production

- **Ne jamais mélanger** les données de développement et de production : projets
  Supabase **distincts** (développement vs production), bases distinctes.
- Un projet Supabase de **Preview/Staging** séparé valide les changements avant
  production.
- Les clés/variables : `.env.local` en local, variables **Vercel** en Preview/
  Production (voir `docs/vercel.md`).

## Ce que le Starter ne fait pas

- Ne crée **pas** de tables métier (réservation, paiements, CRM, analytics métier…).
- N'applique **pas** de policy RLS arbitraire.
- Sa structure générique ne doit pas être étendue sans nécessité et validation.

> Détails opérationnels : [`docs/supabase.md`](../docs/supabase.md).
