# Multi-tenancy

Ce document décrit l'architecture **multi-tenant générique** du SaaS Starter V2 :
comment les données sont organisées par organisation, comment elles sont isolées
au niveau base, et comment un futur SaaS doit s'appuyer sur cette fondation.

> Règle absolue : **ne jamais déclarer le multi-tenancy « sécurisé » sans avoir
> fait passer les tests d'isolation** (voir [Tests d'isolation](#tests-disolation)).

---

## Architecture

```
User (auth.users)
  └── memberships ──→ Organization ──→ …tables métier du futur SaaS
                             │
                       role (roles)
                             │
                 role_permissions ──→ permission (permissions)
```

- **`organizations`** : entité racine. Toute table métier d'un futur SaaS se
  rattache à `organization_id` (FK) et doit reprendre la même matrice RLS.
- **`memberships`** : un utilisateur appartient à une organisation **avec un rôle**.
  Un utilisateur peut appartenir à plusieurs organisations.
- **`roles` / `permissions` / `role_permissions`** : catalogues génériques
  (`domain.action`) seedés par le Starter. Chaque SaaS peut les étendre via
  migration dédiée.
- **`invitations`** : cycle `pending → accepted | revoked`. Un token aléatoire est
  transmis une seule fois (email) ; seul son **hash SHA-256** est stocké.

---

## Principe de sécurité : l'isolation EST la base

Le frontend peut choisir l'organisation active (cookie, sélecteur, segment URL),
mais **cette sélection ne donne aucun droit** : c'est la base qui décide.

```
Frontend (choix d'org.) → Supabase (JWT) → RLS → autorisation au niveau DB
```

Toutes les policies passent par **`public.has_permission(org, 'domain.action')`** :

```sql
-- security definer / search_path = '' — l'unique source de vérité
select exists (
  select 1
  from public.memberships m
  join public.role_permissions rp on rp.role = m.role
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and rp.permission = p_permission
);
```

---

## Matrice RLS appliquée

### `organizations`

| Opération | Policy | Règle (`authenticated`) |
| --- | --- | --- |
| INSERT | `organizations_insert_own` | `created_by = auth.uid()` (on ne crée QUE pour soi) |
| SELECT | `organizations_select_member` | `has_permission(id, 'organization.read')` |
| UPDATE | `organizations_update_member` | `has_permission(id, 'organization.update')` (+ `with check`) |
| DELETE | `organizations_delete_owner` | `has_permission(id, 'organization.delete')` |

### `memberships`

| Opération | Policy | Règle (`authenticated`) |
| --- | --- | --- |
| INSERT | **aucune** | ajout d'un membre uniquement via `accept_invitation()` ou trigger de création |
| SELECT | `memberships_select_own_or_read` | `user_id = auth.uid() OR has_permission(org, 'members.read')` |
| UPDATE | `memberships_update_manage` | `has_permission(org, 'members.update')` |
| DELETE | `memberships_delete_manage` | `has_permission(org, 'members.remove')` |

### `invitations`

| Opération | Policy | Règle (`authenticated`) |
| --- | --- | --- |
| INSERT | **aucune** | seul `create_invitation()` (security definer) |
| UPDATE | **aucune** | seul `revoke_invitation()` (security definer) |
| SELECT | `invitations_select_manage` | `has_permission(org, 'members.read')` |
| DELETE | `invitations_delete_manage` | `has_permission(org, 'members.remove')` |

### Catalogues (`roles`, `permissions`, `role_permissions`)

Lecture publique (`SELECT using (true)`) — **documentée** comme catalogue,
aucune donnée d'organisation exposée.

---

## Rôles et permissions seedés

| Rôle | Permissions |
| --- | --- |
| **owner** | toutes (`organization.*`, `members.*`) |
| **admin** | toutes sauf `organization.delete` |
| **member** | `organization.read`, `members.read` |

Ajouter une permission à un futur SaaS = une **migration** :

```sql
insert into public.permissions (name, description) values
  ('listings.read', 'Lire les annonces de l''organisation.')
on conflict (name) do nothing;

insert into public.role_permissions (role, permission) values
  ('member', 'listings.read')
on conflict (role, permission) do nothing;
```

---

## Invitations (flux sécurisé)

| Étape | Fonction | Rôle vérifié |
| --- | --- | --- |
| Créer | `create_invitation(org, email, role)` → **retourne le token brut** (une seule fois) | `members.invite` |

  - le token est haché (SHA-256) avant stockage : une fuite de la base ne révèle
    jamais un token utilisable ;
  - expiration après **7 jours** (`expires_at`) ;
  - **une seule** invitation `pending` par (organisation, email) ;
  - `role = 'owner'` est refusé : l'owner est créé par le trigger à la création
    de l'organisation, et sa cession passe par `members.update`.

| Étape | Fonction | Règle |
| --- | --- | --- |
| Accepter | `accept_invitation(token)` → `uuid` (org) | l'email invité doit posséder un compte `auth.users` ; crée l'appartenance |
| Révoquer | `revoke_invitation(id)` → `boolean` | `members.invite` |

- Les trois fonctions sont `security definer` (`search_path = ''`), droits
  d'exécution retirés au rôle `PUBLIC` — seul `authenticated` peut les appeler.

---

## Intégrité

- `organizations.created_by` : **audit**, `on delete set null` → une organisation
  **survit** à la suppression du compte de son créateur ;
- `memberships.user_id` : `on delete cascade` (l'appartenance meurt avec le compte,
  cohérent avec `profiles`) ;
- `invitations.invited_by` : `on delete set null` (l'invitation survit) ;
- `invitations`/`memberships` changés via les fonctions security definer, jamais
  par écriture client directe ;
- **dernier owner protégé** : trigger `prevent_last_owner_removal` → impossible de
  retirer ou rétrograder la dernière appartenance `owner`.

---

## Tests d'isolation

La CI (job `db-migrations`) applique `tests/db/isolation-tests.sql` sur une base
vierge (`postgres:15` + stubs Supabase). Le fichier joue 3 acteurs
(`alice`, `bob`, `carol`) et vérifie la matrice **obligatoire** :

```
                     SELECT   INSERT   UPDATE   DELETE
User A → Org A       AUTORISÉ AUTORISÉ AUTORISÉ AUTORISÉ
User A → Org B       REFUSÉ   REFUSÉ   REFUSÉ   REFUSÉ
User B → Org B       AUTORISÉ AUTORISÉ AUTORISÉ AUTORISÉ
User B → Org A       REFUSÉ   REFUSÉ   REFUSÉ   REFUSÉ
```

plus :

- création automatique de l'appartenance `owner`, permissions `has_permission` ;
- cycle complet d'invitation (création, liste, réception, acceptation) ;
- refus de réutilisation d'un token ; refus pour un email sans compte ; refus
  cross-organisation (révoquer l'invitation d'une autre org) ;
- protection du dernier owner (delete / demote refusés) ;
- inaccessibilité totale du rôle `anon`.

**Si un seul de ces tests échoue, la phase multi-tenancy est BLOQUÉE** : un
accès cross-organisation n'est jamais autorisé silencieusement.

---

## Sélection de l'organisation active (frontend)

- Le serveur expose `src/lib/orgs/` → `listUserOrganizations()` : organisations de
  l'utilisateur (RLS côté base, triées par nom).
- Le sélecteur d'organisation (cookie « org active ») est un simple **confort UX** :
  quel que soit l'id passée, la DB refait l'autorisation via RLS. Toute query
  d'un futur SaaS doit filtrer par `organization_id` — jamais par simple confiance
  au cookie.

---

## Ce que le Starter ne fait PAS ici

- pas de notion de plan / abonnement / facturation (phase dédiée) ;
- pas de colonnes `org_slug` court ou `plan` par défaut : à ajouter dans le SaaS,
  avec migration et sauvegarde de l'unicité ;
- pas de soft delete (`deleted_at`) — voir `documentation/database.md` ;
- pas de gestion fine « qui peut donner le rôle owner » : la cession de propriété
  passe par `members.update` (réservé aux owners/admin). Limitation documentée.