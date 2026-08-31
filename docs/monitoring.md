# Monitoring — Sentry

Ce document décrit l'intégration de **Sentry** pour la détection d'erreurs
applicatives. **Sentry n'est pas encore installé** : aucun DSN n'a été fourni, et on ne
crée pas de configuration fictive.

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

- **Aucune** trace de Sentry dans `package.json`, `src/` ou la configuration.
- Aucun DSN n'est présent dans le code ni dans `.env.example`.

Tant qu'un **DSN réel** n'est pas fourni, le projet reste sans Sentry — c'est un choix
volontaire (pas de valeur factice).

---

## Intégration recommandée (à faire manuellement)

Dépendances recommandées (à installer quand le DSN sera disponible) :

```bash
pnpm add @sentry/nextjs
```

Puis configuration via **`sentry.client.config.ts`**, **`sentry.server.config.ts`**
et **`sentry.edge.config.ts`** (ou l'outil `npx @sentry/wizard -i nextjs`).

Le **DSN** doit être fourni via une variable d'environnement **côté serveur**, par
exemple :

```
NEXT_PUBLIC_SENTRY_DSN=
```

> ⚠️ Si le DSN doit rester côté serveur, ne pas le préfixer par `NEXT_PUBLIC_*`. Le
> mode exact dépend de la configuration choisie (client vs serveur).

### Étapes manuelles

1. Créer un projet **Sentry** et récupérer le **DSN**.
2. Installer `@sentry/nextjs` et lancer le wizard.
3. Configurer le DSN en variable d'environnement.
4. Initialiser dans `instrumentation.ts` (convention Next.js).
5. Vérifier dans Sentry que les erreurs remontent réellement.

---

## Confidentialité

Ne **jamais** collecter via Sentry (ou tout analytics) :

- mots de passe ;
- tokens / clés ;
- données sensibles ;
- informations personnelles (PII) non nécessaires à la correction.

Désactiver la capture de données non essentielles (ex. valeurs de formulaires
sensibles) via les options de rédaction de Sentry (`beforeSend`,
`beforeSendTransaction`, redaction list).

---

## Vérification

La documentation du repo ne doit **jamais** affirmer « Sentry configuré » tant que le
projet n'est pas réellement connecté. Après configuration, vérifier un événement de
test dans le tableau de bord Sentry.
