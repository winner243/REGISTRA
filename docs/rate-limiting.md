# Rate limiting

Ce document décrit l'architecture **réutilisable** de protection contre les abus du
SaaS Starter V2, et sa stratégie d'adoption par les futurs SaaS.

---

## Principe

Penser par scénario, jamais par valeur arbitraire :

```
Endpoint
    ↓
Qui ?         (Utilisateur / IP / organisation)
    ↓
Limite        (quota par fenêtre)
    ↓
Fenêtre       (durée)
    ↓
Réponse 429   (Retry-After + X-RateLimit-*)
```

Une valeur comme « 100 requêtes/minute » n'est **pas** une règle universelle : chaque
endpoint a son coût, son trafic et son modèle. La stratégie est **configurable**
endpoint par endpoint.

---

## Architecture (`src/lib/rate-limit/`)

| Fichier | Rôle |
| --- | --- |
| `store.ts` | `RateLimitStore` (interface) + `MemoryRateLimitStore` (fenêtre fixe, sans infrastructure) |
| `limiter.ts` | `RateLimiter` (check / checkOrThrow), `RateLimitError`, instance par défaut |
| `guard.ts` | `assertRateLimit()` : porte d'entrée pour les **Server Actions** |
| `next.ts` | `protect()` / `protectRequest()` pour les **Route Handlers** + réponse `429` |
| `keys.ts` | `clientIp()` (headers fiables) + `buildRateLimitKey()` (user prioritaire sinon IP) |
| `config.ts` | `rateLimitPresets` : points de départ pour les scénarios connus |

### Route Handler (référence : `/api/sentry-test`)

```ts
import { protectRequest } from "@/lib/rate-limit"
import { rateLimitPresets } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const limited = protectRequest(request, {
    prefix: "sentry-test",              // clé isolée pour cet endpoint
    rule: rateLimitPresets.api,         // règle ajustable
  })
  if (limited) return limited           // 429 + Retry-After

  // ... logique de l'endpoint
}
```

### Server Action

```ts
import { assertRateLimit, RateLimitError, buildRateLimitKey } from "@/lib/rate-limit"
import { rateLimitPresets } from "@/lib/rate-limit"

export async function generate(_prev: unknown, formData: FormData) {
  try {
    // user.id provient d'une session vérifiée côté serveur.
    assertRateLimit({
      key: buildRateLimitKey("generate", user?.id),
      rule: rateLimitPresets.ai,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { error: "Trop de demandes. Réessaie dans une minute." }
    }
    throw error
  }
  // ... génération
}
```

### Réponse en cas de dépassement

`429 Too Many Requests` avec `Retry-After` (secondes) et `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset` — compatibles avec les outils clients
standards.

---

## Scénarios analysés

| Point exposé | Risque | Recommandation sérieuse (à ajuster) | Présent ? |
| --- | --- | --- | --- |
| **API** | spams en volume | limite par **IP**, règle `api` | couche prête ; aucune API métier à protéger |
| **Auth** (login/forgot-password) | brute force | limite par **IP ou utilisateur**, règle `auth` | **branchée** : `login`, `signUp`, `forgotPassword`, `resetPassword` protégés (10 requêtes / 60 s par IP) |
| **Recherche** | requêtes coûteuses | limite par **utilisateur**, fenêtre adaptée | couche prête ; pas de moteur de recherche dans le Starter |
| **IA / génération** | coût par token | limite basse par **utilisateur**, règle `ai` | couche prête ; aucun endpoint IA |
| **Uploads** | stockage / DoS | limite par **utilisateur**, règle `upload` | couche prête ; pas d'uploads dans le Starter |
| **Emails** (invitations, reset) | envoi abusif → coûts | limite par **utilisateur**, règle `email` | couche prête ; pas d'emails applicatifs |
| **Exports** | coût de génération | limite basse par **utilisateur**, règle `export` | couche prête ; couplée à `docs/data-export.md` |

> L'auth est **protégée dès le Starter** : les Server Actions `login`, `signUp`,
> `forgotPassword` et `resetPassword` passent par `assertRateLimit` avec la règle
> `auth` (10 requêtes / 60 s par IP, clé `auth:<action>:ip:<ip>`). Les valeurs sont
> calibrées pour un Starter ; le futur SaaS les ajustera à son trafic réel
> (`src/lib/auth/actions.ts`).

### Références actuellement protégées

- **Server Actions d'auth** : `login`, `signUp`, `forgotPassword`, `resetPassword`
  (`assertRateLimit`, règle `auth`, 10 requêtes / 60 s par IP).
- **Route Handler** `GET /api/sentry-test` (egress Sentry) : `protectRequest` avec
  `rateLimitPresets.api`. C'est l'exemple d'intégration canonique d'un Route Handler.

---

## Infrastructure : en mémoire d'abord, partagée si nécessaire

`MemoryRateLimitStore` est **sans infrastructure additionnelle** : suffisant en
développement et sur une instance unique.

⚠️ En déploiement **serverless multi-instances** (Vercel), la mémoire n'est pas
partagée : le quota est par instance. Pour un rate limiting **global et fiable**, un
stockage partagé est requis — Redis (Upstash) ou une **table Supabase** (Counter avec
`created_at`, nettoyée par rétention) implémentant la même interface `RateLimitStore`.
Cette substitution ne change **aucun** appelant : c'est le **store** qu'on remplace.

Aucun store distribué n'a été ajouté (pas de nouvelle infrastructure sans besoin
démontré) ; le point est documenté pour la phase de déploiement.

---

## Règles de durcissement

- Toujours se fonder sur l'**identité vérifiée côté serveur** quand elle existe
  (`buildRateLimitKey` met l'utilisateur en priorité) ; l'**IP** n'est qu'un
  repli pour les endpoints publics.
- L'IP seule est contournable (proxies, pools) : ce n'est jamais une autorisation.
- Ne jamais exposer les buckets internes dans les erreurs.
- Rejeter une règle invalide (`limit ≤ 0`, `windowMs ≤ 0`) à la vérification : les
  erreurs de configuration se voient en dev, pas en prod.
- Coupler à l'authentification et aux **policy RLS** : le rate limiting ralentit,
  il ne remplace pas le contrôle d'accès.

---

## Tester

```bash
pnpm test    # src/lib/rate-limit/rate-limit.test.ts
```

Comportements couverts :

- requête normale → **autorisée** (sous la limite) ;
- limite dépassée → **refus** (`allowed: false`, `retryAfterMs > 0`, `429`) ;
- fin de fenêtre → quota **réinitialisé** ;
- clés isolées (utilisateur vs IP) indépendantes ;
- `checkOrThrow` / `assertRateLimit` lèvent `RateLimitError` ;
- règles invalides rejetées.