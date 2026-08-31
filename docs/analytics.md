# Analytics

Ce document décrit une **architecture d'analytics réutilisable** pour le SaaS Starter
V2. **Aucun fournisseur analytics n'est installé ni imposé** : on ne force jamais de
service payant ni de configuration fictive.

---

## Objectif

Préparer une base permettant, plus tard, de mesurer :

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

- **Aucun** fournisseur analytics dans `package.json` ou `src/`.
- Les occurrences de « Analytics » dans le code sont du **texte UI** (libellés de
  pages), pas du code de mesure.

---

## Principes de l'architecture

1. **Événements clairement nommés** — chaînes stables et explicites
   (ex. `user.signed_up`, `page.viewed`), regroupées par domaine.
2. **Fonctions réutilisables** — un module central (ex. `src/lib/analytics/`) expose
   des helpers (`track(event, properties)`), pas des appels dispersés.
3. **Respect de la confidentialité** — ne jamais envoyer mots de passe, tokens, clés,
   données sensibles ou PII inutiles.
4. **Fournisseur remplaçable / désactivable** — l'abstraction doit permettre de
   brancher Plausible, Umami, PostHog, GA4, etc., sans changer les appels, et de
   désactiver la mesure (ex. en environnement de dev ou selon consentement).
5. **Aucune dépendance inutile** — ne rien ajouter tant qu'un fournisseur n'est pas
   réellement choisi.

---

## Structure recommandée (à créer au moment du choix)

```
src/lib/analytics/
├── events.ts        → noms d'événements typés
├── provider.ts      → interface + fournisseur (remplaçable)
└── index.ts         → API publique : track(), identify(), disable()
```

Exemple d'API cible (non encore implémentée) :

```ts
import { track, disableAnalytics } from "@/lib/analytics"

track("user.signed_up", { source: "landing" })
disableAnalytics() // selon le contexte / le consentement
```

---

## Événements génériques (suggestions, à adapter)

| Domaine | Événements possibles |
| --- | --- |
| Parcours publiques | `page.viewed`, `pricing.viewed` |
| Authentification | `user.signed_up`, `user.logged_in`, `user.logged_out` |
| Usage du produit | `dashboard.viewed`, `feature.used` |

Ces événements sont **génériques** ; chaque futur SaaS ajoutera les siens sans casser
la structure.

---

## Choix du fournisseur (action manuelle)

- Choisir un fournisseur (autohébergé type Plausible/Umami, ou SaaS type PostHog/GA4).
- Créer le compte et récupérer un identifiant/DSN.
- Installer uniquement la dépendance nécessaire.
- Configurer via variable d'environnement.

Ne jamais mettre de clé d'analytics dans le code, Git, `.env.example`, les règles ou
`ci.yml`.
