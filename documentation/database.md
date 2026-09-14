# Base de données

Ce document décrit le rôle de **Supabase** dans le SaaS Starter V2 et les règles à
respecter pour la base de données et la sécurité des données.

---

## Rôle de Supabase

Supabase fournit deux briques au Starter :

1. **Authentification** — gestion des utilisateurs, sessions, confirmation email,
   réinitialisation de mot de passe.
2. **Base de données PostgreSQL** — stockage des données applicatives.

Le Starter est **générique** : il crée une table de fondation liée à l'Auth
(`public.profiles`), un socle multi-tenant **réutilisable** (organisations,
membres, rôles/permissions, invitations) et un **billing engine** agnostique
(plans, abonnements, entitlements, limites, usage — voir
[`docs/billing.md`](../docs/billing.md)) — le tout sans **aucune donnée métier**.
Chaque futur SaaS définira son propre modèle de données **dans son propre projet**,
rattaché aux organisations existantes (voir [`docs/multi-tenancy.md`](../docs/multi-tenancy.md)).

---

## Organisation des fichiers

```
supabase/
├── config.toml                  # configuration locale de dev (supabase start)
└── migrations/                  # migrations versionnées, ordonnées par timestamp
    ├── 20260907000000_foundation_extensions.sql   # extensions + trigger updated_at
    ├── 20260907000001_foundation_profiles.sql     # table profiles + RLS + triggers
    ├── 20260907000002_foundation_multitenancy.sql # multi-tenancy générique (RLS)
    └── 20260907000003_billing_engine.sql          # billing : plans, abonnements,
                                                   #   entitlements, limites, usage
tests/db/supabase-auth-stubs.sql # stubs Supabase pour la validation sur base vierge
tests/db/isolation-tests.sql     # tests d'isolation multi-tenant (matrice A→A/A→B/…)
tests/db/billing-tests.sql       # tests du billing engine (entitlements, limites,
                                 #   usage, RLS, sécurité)
```

---

## Workflow de modification du schéma

Aucune modification de schéma ne se fait en direct. Tout changement suit le cycle
obligatoire :

```
Modification
     ↓
Migration            ← fichier SQL versionné dans supabase/migrations/
     ↓
Migration testée     ← appliquée et vérifiée sur un environnement propre (CI)
     ↓
Migration versionnée ← commitée + review
     ↓
Review               ← relecture par l'équipe avant application
     ↓
Production           ← application ciblée (db push) puis vérification
```

### Règles des migrations

- **Versionnées** : un fichier par changement, suffixé `<timestamp>_description.sql`
  (ex. `20260907000001_foundation_profiles.sql`). L'ordre d'application est
  alphabétique = chronologique.
- **Reproductibles** : une migration s'applique à l'identique sur un environnement
  propre (dev local, preview, production). Pas d'état caché, privilégier les
  instructions sûres (`if not exists`, `create or replace`).
- **Testées avant application** : la CI applique l'ensemble des migrations sur une
  base PostgreSQL vierge à chaque push/PR (job `db-migrations`).
- **Compréhensibles** : un commentaire en tête explique le **rôle**, le **contenu**
  et les **décisions d'intégrité** prises.
- **Jamais réécrites** : une migration déjà appliquée en production ne se modifie
  jamais. Un correctif = une **nouvelle** migration.
- **Pas de modification manuelle** : aucune instruction `ALTER`/`UPDATE` ad hoc sur
  la base de production ; toute évolution passe par `db push`.

### Application

```bash
# Démarrage de la base locale (Docker) depuis un environnement propre
pnpm dlx supabase start

# Application des migrations (local)
pnpm dlx supabase db push

# Application sur un projet distant (preview/prod, après validation)
pnpm dlx supabase db push --remote
```

> La CLI Supabase n'est pas une dépendance du paquet : on l'invoque via
> `pnpm dlx supabase`. Le projet n'est pas encore *linké* à un projet distant :
> le lien se fait à la première mise en place d'un environnement (voir
> [Actions manuelles](#actions-manuelles)).

---

## Intégrité des données

Chaque colonne d'une table doit avoir une **justification explicite** :

| Outil | Quand l'utiliser | Exemple |
| --- | --- | --- |
| **Primary key** | toujours | `profiles.id` (FK vers `auth.users.id`) |
| **Foreign key** | dès qu'une référence existe | `profiles.id → auth.users.id` |
| **NOT NULL** | champ obligatoire dès l'insertion | `created_at`, `updated_at` |
| **UNIQUE** | identifiant naturel interdit en doublon | (unicité des emails gérée par Auth) |
| **CHECK** | invariant vérifiable par la base | longueurs, plages, formats |
| **DEFAULT** | valeur serveur par défaut | `default now()` pour les timestamps |
| **Index** | uniquement pour les requêtes réellement fréquentes | voir [Indexes](#indexes) |

Règles :

- Aucune contrainte orpheline : chaque contrainte répond à un besoin documenté.
- Les contraintes sont nommées explicitement (`profiles_pkey`, `profiles_update_own`…).
- Pas de contrainte « au cas où » : l'ajout se fait dans la migration qui crée le
  besoin, jamais avant.

---

## Indexes

- Un index est ajouté **quand une requête connue l'exige**, jamais par anticipation.
  La primary key et les foreign keys sont indexées automatiquement par PostgreSQL.
- Critères de décision : requête lue par le chemin d'accès principal, volume
  attendu, cardinalité. Exemple : un ORM ou un filtre sur `user_id`.
- Chaque index s'accompagne de la requête qu'il sert dans la migration.
- Suppression d'index inutilisés possible uniquement via migration dédiée.

> La fondation (`profiles`) n'ajoute **aucun** index hors clés : ses accès se font
> par `auth.uid() = id` (couvert par la primary key).

---

## Relations

- **Toujours** modéliser les relations par des **foreign keys** (référentiel
  d'intégrité au niveau base, pas seulement applicatif).
- Utiliser `on delete` cohérent avec la loi de vie des données :
  - `cascade` : la ligne enfant n'a pas de sens sans son parent (`profiles` ;
    propriété d'un user) ;
  - `restrict` / `set null` : la suppression du parent doit être bloquée ou le
    lien neutralisé (ex. historique conservé).
- Les foreign keys vers `auth.users` garantissent qu'un profil ne peut pas exister
  sans utilisateur Auth ; la suppression d'un utilisateur purge ses dépendances.

---

## RLS — Row Level Security

Le **frontend n'est pas** la frontière de sécurité : c'est la base qui autorise.

- Toute table est créée avec
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- Policies rédigées séparément pour `SELECT`, `INSERT`, `UPDATE`, `DELETE`, avec le
  rôle concerné (`authenticated`, `anon`, jamais `service_role` côté client).
- Le rôle `service_role` demeure le seul contournement administratif légitime
  (opérations serveur privilégiées, jamais dans le navigateur).
- Pas de policy `FOR ALL USING (true)` sauf donnée strictement publique **et**
  documentée.

### Matrice appliquée à `public.profiles`

| Opération | Policy | Règle |
| --- | --- | --- |
| SELECT | `profiles_select_own` | `authenticated` : `auth.uid() = id` |
| INSERT | aucune | création automatique via trigger signup |
| UPDATE | `profiles_update_own` | `authenticated` : `auth.uid() = id` (+ `with check`) |
| DELETE | aucune | gestion de compte via auth / admin |

### Rappel

```
Frontend → Supabase → RLS → autorisation au niveau DB
```

---

## Timestamps

- Colonnes `created_at` et `updated_at` (`timestamptz not null default now()`)
  sur toute table suivie.
- **Jamais écrites par le client** : le serveur (base) les gère.
- `updated_at` est maintenu par le trigger générique
  `public.handle_updated_at()` (créé par la migration de fondation).
- Ne pas interpréter `updated_at` comme un « dernier accès » : c'est une date
  d'écriture, pas de lecture.

---

## Soft delete

**Décision de la fondation : pas de `deleted_at`.**

Le Starter ne l'applique pas car :

- la seule table de fondation (`profiles`) vit et meurt avec l'utilisateur Auth
  (suppression en cascade, aucun archivage à conserver) ;
- le soft delete ajoute une complexité permanente (filtres `WHERE deleted_at IS NULL`,
  politiques, rétention) sans besoin démontré à ce stade ;
- chaque futur SaaS décidera s'il a réellement besoin de conserver des données
  « supprimées ».

**Si un futur SaaS en a besoin**, il documentera explicitement :

```
suppression logique        ← deleted_at posée par la base (jamais par le client)
     ↓
récupération éventuelle    ← requête de restauration via migration/script dédié
     ↓
rétention                  ← durée et purge automatique (ex. job cron Supabase)
     ↓
suppression définitive     ← VACUUM/delete physique après rétention
```

---

## Validation automatique (CI)

Le job `db-migrations` du workflow `.github/workflows/ci.yml` :

1. démarre une base PostgreSQL vierge (`postgres:15`) ;
2. applique `tests/db/supabase-auth-stubs.sql` (stubs Supabase : rôles RLS,
   schéma `auth`, `extensions`, ACL par défaut) — **test uniquement**, jamais en
   production ;
3. applique les migrations dans l'ordre ;
4. exécute `tests/db/isolation-tests.sql` — **matrice d'isolation multi-tenant**
   obligatoire (A→A / A→B / B→B / B→A sur SELECT/INSERT/UPDATE/DELETE + cycle
   d'invitation). Un échec bloque la phase ;
5. exécute `tests/db/billing-tests.sql` — **billing engine** : entitlements
   (feature autorisée/interdite), limites (sous la limite / attaché · dépassement /
   clé non bornée), usage (consommation atomique, rollover de période), RLS
   (lecture `billing.read`, aucune écriture client, cross-org, `anon`), comportements
   sans abonnement / expiré / cancelé. Un échec bloque la phase ;
6. vérifie les objets créés (tables publiques, policies RLS).

La CI **échoue** si une migration est invalide, non ordonnée ou casse un objet
existant : c'est la porte d'entrée obligatoire avant toute application en
production.

---

## Distinction développement / production

- **Ne jamais mélanger** les données de développement et de production : projets
  Supabase **distincts** (développement vs production), bases distinctes.
- Un projet Supabase de **Preview/Staging** séparé valide les changements avant
  production.
- Les clés/variables : `.env.local` en local, variables **Vercel** en Preview/
  Production (voir `docs/vercel.md`).
- Le `supabase/config.toml` ne concerne que le **dev local** ; chaque environnement
  distant possède sa propre configuration de plateforme.

---

## Ce que le Starter ne fait pas

- Ne crée **pas** de tables métier (réservation, immobilier, location, CRM,
  analytics métier…). Le billing engine (plans, abonnements, entitlements,
  limites, usage) reste une **infrastructure générique** : il ne porte aucun tarif
  ni aucun fournisseur de paiement (voir [`docs/billing.md`](../docs/billing.md)).
- N'applique **pas** de policy RLS arbitraire.
- Son socle générique (profiles, multi-tenancy via
  [`docs/multi-tenancy.md`](../docs/multi-tenancy.md), billing via
  [`docs/billing.md`](../docs/billing.md)) ne doit pas être étendu
  sans nécessité et validation : chaque SaaS porte son propre modèle métier,
  rattaché aux organisations.

> Détails opérationnels : [`docs/supabase.md`](../docs/supabase.md).

---

## Actions manuelles

- Installer/activer la **CLI Supabase** et **Docker** pour lancer la base locale
  (`pnpm dlx supabase start`).
- Linker un projet distant avant toute application en preview/production :
  `pnpm dlx supabase link --project-ref <ref>`.
- Créer les projets Supabase **dev**, **preview** et **production** séparés et
  renseigner les variables `.env.local` / Vercel.