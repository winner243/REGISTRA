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
**Statut :** En attente (action manuelle)

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
