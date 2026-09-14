# Monitoring — Sentry

Ce document décrit l'intégration de **Sentry** (via `@sentry/nextjs`) pour la
détection d'erreurs applicatives. Le SDK est **installé** et s'active dès qu'un
DSN réel est fourni ; sans DSN, rien n'est envoyé.

---

## Objectif

Comprendre une erreur :

```
Erreur
  → Quand ? (timestamp)
  → Où ? (fichier, composant, route)
  → Contexte technique (stacks, variables)
  → Correction
```

---

## Situation actuelle

- Dépendance installée : `@sentry/nextjs`.
- Intégration Next.js 16 (App Router) via `next.config.ts` (`withSentryConfig`)
  et les conventions d'instrumentation :
  - `src/instrumentation.ts` — serveur (runtime `nodejs` **et** `edge`) ;
  - `src/instrumentation-client.ts` — navigateur.
- Configuration initialisée par runtime :
  - `src/sentry.server.config.ts` (Node.js) ;
  - `src/sentry.edge.config.ts` (Edge / proxy) ;
  - l'initialisation navigateur est dans `src/instrumentation-client.ts`.
- Le DSN se lit dans la variable **publique** `NEXT_PUBLIC_SENTRY_DSN`
  (nécessaire aussi pour capter les erreurs navigateur). Tant qu'elle est vide,
  le SDK est présent mais inactif (aucun appel réseau).
- Validation par tests + route de diagnostic.

---

## Variables d'environnement

| Variable | Usage |
| --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN du projet Sentry (publique, lisible par le navigateur et le serveur) |

La valeur se met dans `.env.local` (dev) et dans les variables Vercel
(Preview / Production). `.env.example` ne contient que le **nom**.

---

## Confidentialité

Ne **jamais** collecter via Sentry :

- mots de passe ;
- tokens / clés ;
- données sensibles ;
- informations personnelles (PII) non nécessaires à la correction.

La configuration désactive par défaut :
- `userInfo` (pas d'identité utilisateur automatique) ;
- `httpBodies` (aucun corps de requête HTTP) ;
- `stackFrameVariables` (pas de variables de stack).

Compléter avec `beforeSend` / `beforeSendTransaction` si un futur SaaS doit
rédiger davantage de données.

---

## Vérification

### Test automatisé

`src/lib/monitoring/sentry.test.ts` :
- vérifie que les hooks serveur (capture) existent ;
- si un DSN est présent dans `.env.local`, teste une capture de bout en bout ;
- sans DSN (ex. CI), les tests liés au DSN sont ignorés, la suite reste verte.

### Route de diagnostic

`GET /api/sentry-test` renvoie l'état du client Sentry et capture une erreur de
test :
- `GET /api/sentry-test` — capture une exception ;
- `GET /api/sentry-test?capture=requestError` — capture une erreur de requête.

La collection Bruno `bruno/api/sentry-test/` couvre ces deux cas.

### Vérification manuelle dans Sentry

Après configuration du DSN réel dans les environnements souhaités :
1. appeler la route de diagnostic ;
2. vérifier que l'événement de test apparaît dans le tableau de bord Sentry.