# Journal des décisions techniques

Ce document consigne les décisions **réellement prises** sur le SaaS Starter V2.
Il est volontairement sobre : on ne documente que des choix effectivement présents
dans le projet, pas des intentions.

---

# Décision : Architecture App Router de Next.js avec groupes de routes

**Date :** création du Starter
**Statut :** Acceptée

**Contexte :** il fallait structurer les routes d'un SaaS générique (marketing, auth,
zone protégée) de manière claire et réutilisable.

**Décision :** utiliser l'App Router de Next.js 16 avec des groupes de routes nommés
`(marketing)`, `(auth)`, `(app)`, `(reset)`, plus une route `auth/callback`.

**Alternatives :** Pages Router ; organisation par type de page sans groupe.

**Raison :** les groupes permettent de cloisonner les layouts (public vs protégé) et
d'exprimer l'accès par structure de dossier.

**Conséquences :** structure explicite ; la protection se fait par le layout du groupe
`(app)` (`requireUser()`).

---

# Décision : Authentification pilotée côté serveur avec Supabase

**Date :** phase Supabase
**Statut :** Acceptée

**Contexte :** il fallait une authentification sécurisée et réutilisable.

**Décision :** utiliser `@supabase/ssr` avec des clients navigateur/serveur séparés,
des Server Actions dans `src/lib/auth/actions.ts` et la vérification d'identité via
`auth.getUser()` côté serveur.

**Alternatives :** auth entièrement côté client.

**Raison :** ne jamais faire confiance au frontend ; les décisions d'autorisation
doivent être prises côté serveur.

**Conséquences :** le frontend ne porte qu'une logique UX ; la sécurité repose sur le
serveur et RLS.

---

# Décision : Validation des entrées avec Zod, côté serveur

**Date :** phase validation
**Statut :** Acceptée

**Contexte :** il fallait fiabiliser les entrées (email, nom, prix, téléphone, mot de
passe) et produire des messages utilisateur lisibles.

**Décision :** Zod 4 avec des schémas réutilisables dans `src/lib/validation/` et des
schémas auth dans `src/lib/auth/schemas.ts` ; `safeParse` + `getFirstErrorMessage`.

**Alternatives :** validation manuelle ; dépendance de validation frontend uniquement.

**Raison :** une validation déclarative, typée et applicable côté serveur.

**Conséquences :** `emailSchema` normalise (trim + minuscules) avant validation ; les
entrées clientes restent non fiables et sont validées côté serveur.

---

# Décision : Tests unitaires avec Vitest

**Date :** phase testing
**Statut :** Acceptée

**Contexte :** il fallait vérifier la logique importante (schémas, helpers) sans
dépendance à un serveur.

**Décision :** Vitest, configuration `vitest.config.ts`, alias `@` → `src`, fichiers
`*.test.ts` au plus près du code, commande `pnpm test`.

**Alternatives :** Jest ; tests E2E (Playwright) dès cette phase.

**Raison :** Vitest est léger, rapide, intégré à pnpm/Vite ; les tests unitaires
couvrent la logique pure.

**Conséquences :** la CI exécute `pnpm test` ; Playwright non encore introduit.

---

# Décision : CI avec GitHub Actions

**Date :** phase automation
**Statut :** Acceptée

**Contexte :** il fallait empêcher qu'un code défectueux soit validé.

**Décision :** workflow `ci.yml` sur push `main` + PR : install (frozen-lockfile),
lint, typecheck, test, build.

**Alternatives :** pas de CI ; CI minimaliste (lint seulement).

**Raison :** gating complet et reproductible, sans secret obligatoire.

**Conséquences :** tout échec bloque la validation avant déploiement.

---

# Décision : Règles de développement Cursor (architecture, sécurité, testing, database)

**Date :** phase automation
**Statut :** Acceptée

**Contexte :** il fallait guider les IA/agents pour préserver l'architecture et la
sécurité du Starter.

**Décision :** règles `.cursor/rules/*.mdc` (base, typescript, frontend, ui-states,
testing, security, database, workflow) garantissant : réutilisation avant création,
pas de refactor massif, pas de secret, validation serveur, RLS, pas de tables métier
arbitraires.

**Alternatives :** pas de règles ; règles englobantes uniques.

**Raison :** documenter des contraintes permanentes et génériques.

**Conséquences :** les agents suivent un workflow « analyser → réutiliser →
implémenter minimalement → tester ».

---

# Décision : Pas de Sentry ni d'analytics installés par défaut

**Date :** phase monitoring
**Statut :** Remplacée (voir décision suivante)

**Contexte :** il fallait un monitoring et une base d'analytics, mais sans imposer un
service ni créer de configuration fictive.

**Décision :** ne pas installer Sentry ni de fournisseur analytics tant qu'un DSN /
choix de fournisseur réel n'existe pas. Architecture et étapes documentées dans
`docs/`.

**Alternatives :** installer Sentry avec un DSN factice ; choisir arbitrairement un
fournisseur analytics.

**Raison :** ne jamais créer de fausses valeurs ni forcer un service payant.

**Conséquences :** lint / typecheck / test / build passent sans dépendance
supplémentaire ; la configuration nécessite une action manuelle (voir docs).

---

# Décision : Monitoring Sentry et analytics PostHog, désactivables sans clé

**Date :** phase performance engineering
**Statut :** Acceptée

**Contexte :** des identifiants réels (DSN Sentry et clé PostHog) ont été fournis
pour mesurer erreurs et usage avant toute optimisation de performance.

**Décision :**
- installer `@sentry/nextjs` (instrumentation serveur + client + edge, route de
  test, DSN via `NEXT_PUBLIC_SENTRY_DSN`) ;
- installer `posthog-js` derrière une abstraction remplaçable
  (`src/lib/analytics/`), active uniquement si `NEXT_PUBLIC_POSTHOG_KEY` est posée.

**Alternatives :** rester sans monitoring ; choisir un autre fournisseur.

**Raison :** instrumenter d'abord (mesure) avant d'optimiser ; ne pas coupler
l'application à un SDK concret ; ne jamais envoyer de données sans clé configurée.

**Conséquences :** les deux SDK sont présents dans le bundle mais inactifs sans
variable configurée ; les données collectées excluent PII/body/stack par
défaut ; la CI ne dépend ni du DSN ni de la clé (tests sensibles ignorés sans
`.env.local`).

---

# Décision : Fondation base de données — migrations versionnées, RLS, soft delete non appliqué

**Date :** phase database engineering
**Statut :** Acceptée

**Contexte :** la documentation exigeait des migrations versionnées et le Starter
voulait rester générique (aucun tableau métier), mais aucun fichier de migration
n'existait encore et la chaîne « migration → test → review → production » n'était
pas automatisée.

**Décision :**
- créer une fondation `supabase/` (config locale + `migrations/`) avec deux
  migrations : helpers génériques (extension UUID, trigger `handle_updated_at`) et
  la table générique `profiles` (PK = FK `auth.users`, RLS `SELECT`/`UPDATE` sur
  `auth.uid() = id`, création automatique du profil au signup) ;
- **pas de `deleted_at`** : soft delete non appliqué, workflow de décision
  documenté pour les futurs SaaS ;
- validation obligatoire des migrations sur une base vierge via le job CI
  `db-migrations` (stubs Supabase + application ordonnée + vérification RLS).

**Alternatives :** appliquer les migrations sans validation CI ; créer un soft
delete par défaut ; créer des tables métier pour démontrer l'intégration.

**Raison :** des migrations doivent être **testées** avant production ; la seule
table de fondation vit et meurt avec l'utilisateur Auth (pas de rétention à
gérer) ; le soft delete ajoute une complexité permanente sans besoin démontré.

**Conséquences :** toute évolution de schéma passe par une nouvelle migration
versionnée ; la CI bloque toute PR dont la stack de migrations est invalide ;
chaque futur SaaS conserve la liberté de définir ses tables métier (et un soft
delete documenté si nécessaire).

---

# Décision : Export de données — couche réutilisable CSV/JSON, génération serveur

**Date :** phase data export
**Statut :** Acceptée

**Contexte :** il fallait permettre à un futur SaaS d'exporter les données de ses
utilisateurs, sans créer de système spécifique ni exposer de données hors
autorisation.

**Décision :**
- une seule architecture de streaming (`src/lib/export/`) servant **CSV** (RFC 4180,
  BOM, neutralisation d'injection de formule) et **JSON** (compact) ;
- génération **exclusivement côté serveur** ; autorisation via `ensureCanExport`
  (identité vérifiée + ownership/RLS) ;
- nom de fichier sûr, pagination/batch par `AsyncIterable`, garde `maxRows`
  (`limit-exceeded`) ;
- **pas de PDF** : aucune librairie ni cas d'usage ne le justifie dans le Starter ;
- **pas de suppression destructrice** : seul le parcours futur *Account/Data deletion*
  est documenté.

**Alternatives :** génération côté client ; un système export par format ; PDF par
défaut.

**Raison :** le navigateur ne doit jamais construire de fichier contenant des données
sensibles ; un pipeline unique évite la duplication ; le PDF s'ajoutera là où un
besoin métier réel existe.

**Conséquences :** les Rails d'un export d'un futur SaaS tiennent en un Route Handler
(voir `docs/data-export.md`) ; les erreurs ne fuient jamais de détails techniques.

---

# Décision : Rate limiting — couche configurable en mémoire, activation par endpoint

**Date :** phase rate limiting
**Statut :** Acceptée

**Contexte :** il fallait protéger les points exposés (API, auth, IA, uploads, emails,
exports) sans imposer de valeur arbitraire partout ni ajouter d'infrastructure non
justifiée.

**Décision :**
- couche `src/lib/rate-limit/` : `RateLimitStore` (interface) + `MemoryRateLimitStore`
  (fenêtre fixe, **sans infrastructure**), `RateLimiter`, `assertRateLimit`
  (Server Actions), `protectRequest` (Route Handlers) ;
- politiques **configurables par endpoint** (préréglages `rateLimitPresets` = points
  de départ, jamais des règles universelles) ; clé par **utilisateur prioritaire**,
  sinon **IP** ;
- réponse `429` standard (`Retry-After`, `X-RateLimit-*`) ;
- seule intégration active : `GET /api/sentry-test` (référence) et les actions
  auth (login, inscription, mot de passe oublié, réinitialisation) protégées
  par le préréglage `auth` (clé IP, message utilisateur sans exposition du
  bucket interne) ;
- pas de store distribué (documenté pour la phase de déploiement).

**Alternatives :** limites en dur partout ; proxy/edge rate limiter ; Redis dès
maintenant.

**Raison :** aucune limite universelle n'existe ; activer par endpoint avec des
valeurs calibrées est moins risqué qu'un plafond global arbitraire ; l'infrastructure
partagée n'aura un coût justifié qu'au déploiement serverless multi-instances.

**Conséquences :** toute limite adoptée par un futur SaaS est explicite, testable et
ajustable ; en serverless, il faudra remplacer `MemoryRateLimitStore` par un store
partagé (même interface) sans changer les appelants.

---

# Décision : Multi-tenancy générique — organisations, RLS stricte, isolement testé

**Date :** phase multi-tenancy
**Statut :** Acceptée

**Contexte :** le Starter devait supporter plusieurs « locataires » (utilisateurs,
organisations) sans créer de tables métier, avec une garantie d'isolation au niveau
base et des tests qui le Prouvent.

**Décision :**
- fondation générique dans une migration dédiée : `organizations`, `memberships`,
  `roles`, `permissions`, `role_permissions`, `invitations` ;
- **isolations par RLS** : policies expressives via l'unique fonction
  `public.has_permission(org, 'domain.action')` (security definer,
  `search_path = ''`) ; aucun `FOR ALL USING (true)` hors catalogues publics ;
- invitations **non réversibles par design** : token transmis une seule fois,
  seul un hash SHA-256 persisté, fonctions security definer vérifiant la
  permission `members.invite` ; ajout d'un membre uniquement par acceptation de
  l'invitation (aucune policy INSERT sur `memberships`) ;
- protection du **dernier owner** (trigger) ; `created_by` en audit `set null` ;
- **tests d'isolation obligatoires** dans `tests/db/isolation-tests.sql`
  (matrice A→A / A→B / B→B / B→A sur SELECT/INSERT/UPDATE/DELETE, cycle
  d'invitation, refus cross-organisation, anonyme invisible), exécutés par la CI
  (job `db-migrations`) sur base vierge `postgres:15` ;
- helper serveur `src/lib/orgs/` (liste des organisations de l'utilisateur,
  triée, RLS côté base).

**Alternatives :** isolation côté frontend uniquement ; colonne `org_id` pourrie par
rôle applicatif (`if user.role === 'admin'`) ; invitations stockées en clair.

**Raison :** le frontend peut toujours être détourné — seule la base autorise ;
une matrice explicite (organisation, permission) est réutilisable par tout futur
SaaS ; le coût d'un accès inter-org en production est inacceptable face au coût
d'un test.

**Conséquences :** toute table métier future s'attache à `organization_id` (FK) et
reprend les mêmes policies ; on ne déclare jamais le multi-tenancy « sécurisé »
sans avoir fait passer les tests d'isolation ; limitation documentée : la cession
de propriété d'une organisation passe par `members.update` (owner/admin), il n'y a
pas encore de règle fine globale sur « qui peut nommer un owner ».

---

# Décision : Billing Engine & Entitlements — moteur générique fournisseur-agnostique

**Date :** phase billing engine + entitlements
**Statut :** Acceptée

**Contexte :** il fallait permettre à un futur SaaS de facturer et de contrôler
l'accès aux features par plan — sans coupler le Starter à un fournisseur de
paiement, sans permettre au client de falsifier plan/abonnement/limites/usage, et
en gardant le moteur extensible par catalogues.

**Décision :**
- **sans fournisseur de paiement connecté** : aucune clé, SDK ni webhook de
  paiement réel. Le moteur fournit l'architecture cible
  Webhook → Vérification → Idempotence → Billing Engine (écritures backend
  `service_role`) ; la tarification relève du fournisseur, pas des tables ;
- chaîne générique : `Plan → Subscription → Entitlements → Limits → Usage`,
  avec `Organization →` en tête sur le multi-tenant ;
- catalogues **remplaçables par chaque SaaS** via migration : `plans`, `features`,
  `plan_features` (entitlements), `plan_limits` (limites par clé `domain.key`) —
  le cœur du moteur ne change pas ; aucune logique dispersée du type
  `if plan === 'pro'` ;
- décision côté serveur en base (`security definer`, `search_path = ''`) :
  `get_organization_plan`, `can_use_feature`, `get_plan_limit`, `get_usage`,
  `can_consume_usage`, `consume_usage` (atomique, `FOR UPDATE`), `plan_limits_status`.
  Chaque fonction vérifie `is_member` : cross-org impossible ;
- miroir TypeScript typé et testé (`src/lib/billing/`) : logique pure `engine.ts`
  + wrappers RPC serveur `rpc.ts` + mapping d'erreurs → codes métier ;
- **aucune écriture client possible** : aucune policy d'écriture ni ACL d'écriture
  sur `subscriptions`, `usage`, `usage_events` et les catalogues ; `billing.read`
  porté par `owner`/`admin` (jamais `member`) ; `billing.manage` réservé au backend ;
- tests obligatoires : `tests/db/billing-tests.sql` (CI, base vierge) + Vitest
  (`src/lib/billing/engine.test.ts`) — un contournement de limite ou un accès
  cross-org n'est jamais accepté silencieusement.

**Alternatives :** coupler un fournisseur de paiement dès le Starter ; décider les
droits dans le frontend ; dupliquer `if plan === 'pro'` dans le code métier.

**Raison :** le navigateur ne doit jamais être source de vérité pour les droits ; un
moteur générique est réutilisable par tout SaaS sans modification ; la connexion
d'un fournisseur réel relève d'une phase dédiée et documentée.

**Conséquences :** chaque SaaS définit ses plans/features/limites via migration ;
le coder métier interroge `can_use_feature`/`consume_usage` (jamais le plan en dur) ;
le cycle de vie des abonnements reste piloté par écritures backend jusqu'au
branchement webhook ; la page `/dashboard/billing` affiche le plan effectif de
l'organisation (lecture seule) et un état clair quand aucun plan n'est configuré.

---

# Décision : Audit de sécurité V3 — corrections E1-E4, M1-M11, F5-F9

**Date :** phase security hardening (V3)
**Statut :** Acceptée

**Contexte :** un audit de sécurité complet a identifié 24 issues (0 critique,
4 élevées, 11 moyennes, 9 faibles) nécessitant des corrections avant gel V3.

**Décision :**
- **E1** — Open redirect : `getBaseUrlFromHeaders` priorise `NEXT_PUBLIC_APP_URL`
  ; `safeNextPath` rejette null bytes, `\r\n`, backslashes, URLs absolues,
  protocoles-relatifs ;
- **E2** — OAuth callback : utilise `NEXT_PUBLIC_APP_URL` au lieu de `origin`,
  messages génériques, early return sur code manquant ;
- **E3** — Énumération de comptes : `getSignUpErrorMessage` retourne toujours le
  même message quel que soit l'erreur Supabase ;
- **M1** — Timing-safe comparison : `timingSafeEqual` pour le Bearer token cron ;
- **M2** — Security headers : X-Frame-Options DENY, HSTS, COOP, CORP,
  Permissions-Policy, X-XSS-Protection, X-Content-Type-Options, Referrer-Policy ;
- **M4** — CRLF injection : `stripCrlf` sur tous les sujets email ;
- **M5** — Cookie security : `httpOnly`, `secure` (prod), `sameSite: lax` ;
- **M6** — `plan_limits_status()` : vérifie `billing.read` au lieu de `is_member` ;
- **M7** — Worker cron restreint aux queues autorisées (`emails`) ;
- **M9** — Messages d'erreur génériques (OAuth, cron) ;
- **M10** — CRON_SECRET requis en production (503 sinon) ;
- **F5** — `cron_tasks` : RLS restreint à `authenticated` + ACL révoqué pour
  `anon` ;
- **F6** — CI : `permissions: contents: read` ;
- **F7** — CI : `pnpm audit` ajouté ;
- **F8** — Logs : suppression des données sensibles dans les handlers jobs ;
- **F9** — Storage env : supporte `STORAGE_MAX_UPLOAD_SIZE` et legacy
  `STORAGE_MAX_UPLOAD_BYTES`.

**Alternatives :** ne pas auditer ; reporter les corrections.

**Raison :** un SaaS manipule des données multi-tenant et des secrets ;
chaque issue potentielle doit être traitée avant toute mise en production.

**Conséquences :** la V3 est une baseline sécurisée vérifiée ; les futurs
changements doivent maintenir ce niveau.

---

# Décision : CSP Report-Only progressif

**Date :** phase security hardening (V3)
**Statut :** Acceptée

**Contexte :** les security headers étaient en place mais sans Content Security
Policy. Un CSP restrictif immédiat risquait de casser PostHog, Sentry, les
polices Google ou les styles inline.

**Décision :** ajouter `Content-Security-Policy-Report-Only` (pas `Content-Security-Policy`)
dans `next.config.ts` avec une policy permissive qui ne bloque rien mais identifie
les sources nécessaires.

Policy initiale :
- `default-src 'self'`
- `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
- `img-src 'self' data: https://*.supabase.co blob:`
- `font-src 'self' https://fonts.gstatic.com`
- `connect-src 'self' https://*.supabase.co https://*.sentry.io https://*.posthog.com wss://*.supabase.co`
- `frame-src 'none'`
- `object-src 'none'`
- `base-uri 'self'`
- `form-action 'self'`

**Alternatives :** CSP restrictif immédiat ; pas de CSP.

**Raison :** un CSP Report-Only ne casse rien, collecte les violations réelles
et permet de durcir progressivement sans surprise.

**Conséquences :** les rapports de violations seront analysés pour construire
une CSP restrictive en phase suivante ; `'unsafe-inline'` sera remplacé par
des nonces quand le layout le supportera.

---

# Décision : Rate limiting distribué reporté

**Date :** phase security hardening (V3)
**Statut :** Acceptée (reporté)

**Contexte :** le rate limiting en mémoire (`MemoryRateLimitStore`) est
adapté au développement et aux instances unibles, mais non partagé en
serverless multi-instances.

**Décision :** ne pas ajouter Redis, Upstash ou infrastructure supplémentaire.
Conserver le système actuel avec documentation explicite de la limitation
serverless et de la voie d'évolution (interface `RateLimitStore` déjà
abstraite, swappable sans changer les appelants).

**Alternatives :** ajouter Redis/Upstash maintenant ; utiliser une table
Supabase comme store distribué.

**Raison :** le coût et la complexité d'un store distribué ne sont pas
justifiés tant que le déploiement serverless n'est pas réel. L'abstraction
permettra une migration sans refactor.

**Conséquences :** en serverless multi-instances, le quota est par instance ;
documenté dans `docs/rate-limiting.md`.
