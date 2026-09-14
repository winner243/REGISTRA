# Analytics

Ce document décrit la couche d'**analytics réutilisable** du SaaS Starter V2.
Le fournisseur actuellement branché est **PostHog** (client web) derrière une
**abstraction remplaçable** : le reste de l'application ne dépend jamais du SDK
concret.

---

## Objectif

Mesurer :

- visiteurs ;
- inscriptions ;
- utilisateurs actifs ;
- fonctionnalités utilisées ;
- conversions ;
- abandons.

Le Starter reste **générique** : on ne crée pas d'événements spécifiques à un SaaS
de location ou à un métier particulier.

---

## Situation actuelle

- Dépendance installée : `posthog-js` (+ `posthog-js/react`).
- Fournisseur actif **uniquement** si `NEXT_PUBLIC_POSTHOG_KEY` est renseignée ;
  sinon, la couche rend les enfants sans effet et `track()` est sans action
  (le SaaS ne dépend jamais de PostHog).
- Architecture conforme aux principes ci-dessous, implémentée dans :

```
src/lib/analytics/
├── events.ts        → noms d'événements typés (AnalyticsEvents)
├── config.ts        → lecture des variables d'environnement
├── client.ts        → couche fournisseur remplaçable (PostHog aujourd'hui)
└── index.ts         → API publique : track(), identify(), resetAnalytics(), disableAnalytics()
```

- Composant racine : `src/components/providers/PostHogProvider.tsx`
  (`AnalyticsProvider` + `PostHogPageview`), câblé dans
  `src/app/layout.tsx`.

---

## API publique

```ts
import { track, identify, resetAnalytics, disableAnalytics } from "@/lib/analytics"

track("user.signed_up")            // événement nommé
identify(user.id)                  // identifiant stable, non personnel
resetAnalytics()                   // à la déconnexion
disableAnalytics()                 // selon le contexte / le consentement
```

- **Pageview** : `PostHogPageview` capture une « page » à chaque changement de
  route (visites + navigation) — `capture_pageview` est désactivé au profit de
  cette gestion App Router.
- **Identité** : `identify(user.id)` est appelé dans `AppShell` (dashboard
  authentifié) ; **reset** à la déconnexion dans `UserMenu`.

---

## Événements génériques implémentés

| Domaine | Événement | Déclencheur |
| --- | --- | --- |
| Pages | `$pageview` | chaque changement de route (App Router) |
| Authentification | `user.signed_up` | succès du formulaire d'inscription |
| Authentification | `user.logged_out` | soumission du formulaire de déconnexion |
| Authentification | `user.logged_in` | disponible (`AnalyticsEvents.loggedIn`), pas encore déclenché |

> `user.logged_in` n'est pas encore envoyé : la connexion réussie est une
> **redirection serveur** immédiate vers `/dashboard`, il n'y a donc pas d'état
> de succès visible côté client pour la déclencher de façon fiable. Le rattachement
> de l'utilisateur est assuré par `identify()` au chargement du dashboard.

Ces événements sont **génériques** ; chaque futur SaaS ajoutera les siens sans
casser la structure.

---

## Principes de l'architecture

1. **Événements clairement nommés** — chaînes stables et explicites
   (ex. `user.signed_up`, `user.logged_out`), regroupées par domaine.
2. **Fonctions réutilisables** — la logique passe par `src/lib/analytics/`
   (`track(event, properties)`), pas d'appels dispersés vers le SDK.
3. **Respect de la confidentialité** — jamais de mots de passe, tokens, clés,
   données sensibles ni PII inutiles. `identify()` reçoit un identifiant stable
   **non personnel** (UUID Supabase), jamais l'email.
4. **Fournisseur remplaçable / désactivable** — seule `client.ts` touche le SDK ;
   brancher Plausible, Umami, GA4… ne change aucun appel applicatif, et la mesure
   se désactive selon le contexte (`disableAnalytics()`) ou l'absence de clé.
5. **Aucune clé dans le code** — seules les **variables** d'environnement sont
   référencées dans `.env.example`, jamais de valeurs.

---

## Variables d'environnement

| Variable | Usage |
| --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | Clé publique du projet PostHog |
| `NEXT_PUBLIC_POSTHOG_HOST` | Hôte PostHog (vide = hôte par défaut) |

Ces identifiants sont **publics** (embarqués dans le bundle navigateur), ce ne
sont pas des secrets. La configuration se fait dans `.env.local` (dev) et dans
les variables Vercel (Preview / Production).

---

## Choix du fournisseur (échanger)

- Remplacer PostHog : créer un fournisseur dans `src/lib/analytics/client.ts`
  implémentant la même interface (`track`, `identify`, `reset`, `disable`) et,
  si l'outil le nécessite, adapter le composant racine.
- Les appels applicatifs restent inchangés (ils passent par l'API publique).

Ne jamais mettre de clé d'analytics dans le code, Git ou `.env.example`
(seulement des noms de variables).