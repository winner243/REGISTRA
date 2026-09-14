# Billing Engine & Entitlements

Ce document décrit le **moteur de facturation générique et agnostique** du SaaS
Starter V2 : comment il déclare un plan, un abonnement, des entitlements, des
limites et de l'usage — **sans aucun fournisseur de paiement connecté**.

> Règle absolue : **ne jamais déclarer le billing « sécurisé » sans avoir fait
> passer les tests** (`tests/db/billing-tests.sql`). Une organisation ne doit
> jamais consulter ni modifier le billing d'une autre organisation.

---

## Architecture

```
                    ┌────────────────────────────────────────────┐
                    │              CATALOGUES (publics)          │
                    │   plans · features · plan_features ·       │
                    │   plan_limits                              │
                    └────────────────────────────────────────────┘
                                      ▲
                                      │ (lecture seule par le client)
   Plan ──► plan_features (entitlements)
     └────► plan_limits    (limites par clé)
                                      │
                    ┌────────────────────────────────────────────┐
                    │            PAR ORGANISATION (RLS)           │
                    │   subscriptions · usage · usage_events     │
                    └────────────────────────────────────────────┘
                                      ▲
                     (écriture uniquement via fonctions server,
                      jamais par le client)
                                      │
   MOTEUR D'ÉVALUATION (côté base, security definer)
     get_organization_plan · can_use_feature · get_plan_limit
     get_usage · can_consume_usage · consume_usage · plan_limits_status
```

## Fournisseur de paiement

> **Payment provider : NON CONNECTÉ**

Aucun fournisseur réel (Stripe, PayPal, Mobile Money, …) n'est connecté dans
cette phase. Le moteur est volontairement **fournisseur-agnostique** :

- **Aucun prix** dans les tables de plan : un plan est un *ensemble de features
  et de limites*, pas un tarif. La tarification relève du fournisseur ;
- **Aucun SDK / clé / webhook** de paiement dans le code ;
- Le cycle de vie de l'abonnement (`creer / changer / annuler / expirer`) est
  piloté par des écritures **backend** (rôle `service_role`), prêtes à être
  déclenchées par un futur webhook.

Architecture cible du futur branchement (à documenter lors de la phase dédiée) :

```
Payment Provider
      ↓
Webhook
      ↓
Verification (signature)
      ↓
Idempotency (traitement unique par événement)
      ↓
Billing Engine (write backend : subscriptions, period, cancel_at_period_end)
      ↓
Entitlements (can_use_feature, get_plan_limit, consume_usage)
```

---

## Tables

### Catalogues génériques (lecture publique comme `roles`/`permissions`)

| Table | Rôle |
| --- | --- |
| `plans` | Un plan = un bundle de features + de limites, **sans prix** |
| `features` | Catalogue de features (`feature.analytics`, `feature.export`, …) |
| `plan_features` | **Entitlements** : features activées par un plan |
| `plan_limits` | **Limites** : valeurs par clé (`projects.max`, `exports.monthly`, …) |

Aucune écriture client : pas de policy INSERT/UPDATE/DELETE, pas d'ACL
d'écriture. Chaque futur SaaS **remplace le seed d'exemple** par ses propres
plans via une migration dédiée (mêmes conventions que le seed des rôles).

### Tables par organisation (RLS stricte, `billing.read`)

| Table | Rôle | Écriture |
| --- | --- | --- |
| `subscriptions` | Abonnement d'une organisation à un plan | **aucune** côté client |
| `usage` | Compteurs agrégés par (org, clé, période) | **uniquement** `consume_usage` |
| `usage_events` | Journal append-only (audit, litiges) | **uniquement** `consume_usage` |

Un index partiel garantit **au plus un abonnement courant** par organisation
(`WHERE status IN ('trialing','active')`).

---

## Comportements définis (source de vérité)

| Situation | Plan effectif | Feature | Limite | Consommation |
| --- | --- | --- | --- | --- |
| Abonnement courant (`trialing`/`active`, période incluant `now()`) | le plan | selon `plan_features` | selon `plan_limits` | vérifiée + comptabilisée |
| **Aucun abonnement** | `NULL` | refusée | `NULL` | refusée (`no_active_subscription`) |
| Abonnement **expiré** (période passée) | `NULL` | refusée | `NULL` | refusée |
| Abonnement **canceled** ou **past_due** | `NULL` | refusée | `NULL` | refusée |
| `cancel_at_period_end` pendant `active` | le plan | autorisée | le plan | nomalement vérifiée (fin de période) |
| Clé de limite **non définie** dans le plan | — | — | `NULL` | comptabilisée **sans plafond** (documenté) |
| `usage + quantité ≤ limite` | — | — | — | **autorisée** |
| `usage + quantité > limite` | — | — | — | **refusée** (`usage_limit_exceeded`) |

Cas particulier des bornes : `usage = limite` autorise une quantité **nulle**
(vérification) mais refuse toute quantité **positive**.

La consommation est **atomique** : `consume_usage` verrouille l'abonnement
courant (`FOR UPDATE`) puis compare et incrémente. Les consommations
concurrentes d'une même organisation sont sérialisées : un contournement par la
course entre deux requêtes est impossible.

---

## Sécurité

Le **frontend n'est jamais source de vérité** :

- aucune policy d'écriture sur `subscriptions`, `usage`, `usage_events` ;
- aucun ACL d'écriture (`grant select` uniquement pour `authenticated`) ;
- aucun chemin d'écriture sur les catalogues (entitlements / limites) ;
- toute fonction exposée vérifie `is_member(org)` (basé sur `auth.uid()`) ;
- lectures du billing filtrées par `has_permission(org, 'billing.read')`
  (porté par `owner` et `admin`, **jamais** `member`) ;
- `billing.manage` réservé au backend futur : aucun chemin d'exécution côté
  client ;
- `anon` n'a aucun accès aux tables par organisation ni aux fonctions du moteur ;
- migrations/RLS portées par la même matrice multi-tenant que
  [`docs/multi-tenancy.md`](multi-tenancy.md).

### Matrice RLS

| Table | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| `plans`, `features`, `plan_features`, `plan_limits` | public (catalogue) | **aucune** |
| `subscriptions`, `usage`, `usage_events` | `billing.read` | **aucune** |

---

## Usage, limites et renouvellement de période

Les périodes d'usage suivent celles de l'abonnement courant
(`current_period_start` → `current_period_end`). Au renouvellement, une nouvelle
période démarre : un compteur obsolète n'est jamais re-touché — la somme est
calculée sur la période courante. Le rollover est **implicite** (clé
`(org, usage_key, period_start, period_end)`).

Exemple (les valeurs ci-dessous sont des **exemples du seed**, jamais des
constantes du Starter) :

```
exports.monthly = 100 sur le plan pro
  100 exports consommés → usage = 100
  nouvel export → usage_limit_exceeded → REFUSÉ
```

---

## Définir ses propres plans/features/limites (futur SaaS)

Le moteur reste générique : un SaaS déclare **ses** plans dans une migration,
sans toucher au cœur. Exemple :

```sql
insert into public.plans (code, name, description, sort_order) values
  ('starter', 'Starter', 'Pour démarrer.', 1)
on conflict (code) do nothing;

insert into public.features (code, name) values
  ('notebooks.read', 'Lire les notebooks')
on conflict (code) do nothing;

insert into public.plan_features (plan_code, feature_code) values
  ('starter', 'notebooks.read')
on conflict (plan_code, feature_code) do nothing;

insert into public.plan_limits (plan_code, limit_key, limit_value) values
  ('starter', 'notebooks.max', 3)
on conflict (plan_code, limit_key) do nothing;
```

Le coder métier ne contient **jamais** de `if plan === 'pro'` : il interroge le
moteur, en SQL (via RPC) ou en TypeScript (miroir typé) :

```ts
import { canUseFeature, consumeUsage } from "@/lib/billing"

if (await canUseFeature(orgId, "feature.export")) { … }
await consumeUsage(orgId, "exports.monthly", 1) // lève en cas de dépassement
```

---

## Couche TypeScript

`src/lib/billing/` :

| Fichier | Rôle |
| --- | --- |
| `types.ts` | Types du moteur + `BillingError` |
| `engine.ts` | **Logique pure** (détermination de plan, entitlements, limites) — sans accès base, testée par Vitest |
| `errors.ts` | Mapping des erreurs RPC vers des codes métier typés |
| `rpc.ts` | Wrappers serveur vers les fonctions SQL (la base reste la vérité) |

La base est l'autorité d'exécution ; le moteur TypeScript est un **miroir
typé** côté serveur (Server Actions / Route Handlers) partageant la même
sémantique.

---

## Tests

| Niveau | Fichier | Couverture |
| --- | --- | --- |
| Base (CI `db-migrations`) | `tests/db/billing-tests.sql` | entitlements, plans/changement, limites (borne incluse/exclue), usage non borné, rollover, RLS, cross-org, aucune écriture client, sans-abonnement/expiré/canceled, `anon` |
| Unitaire (Vitest) | `src/lib/billing/engine.test.ts` | logique pure : plans, entitlements, limites, comportements sans abonnement, mapping d'erreurs |

Tout échec de `billing-tests.sql` bloque la phase : un contournement de limite
ou un accès cross-organisation n'est jamais accepté silencieusement.

---

## Ce que cette phase ne fait PAS

- ne connecte **aucun** fournisseur de paiement (voir ci-dessus) ;
- ne crée **aucun** faux système de paiement présenté comme fonctionnel : si
  aucune intégration réelle n'existe, elle est documentée comme NON CONNECTÉE ;
- ne câble aucun écran de paiement / checkout ni gestion d'abonnement côté
  frontend (la page `/dashboard/billing` reste un placeholder statique de v1).