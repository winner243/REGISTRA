# MCP — Servers recommandés

Ce document décrit l'architecture **raisonnable** de MCP servers autour de Cursor pour
le SaaS Starter V2. Principe : **peu de serveurs, moindre privilège, pas de doublon**.

---

## État actuel

- **Aucun MCP server n'est configuré** dans ce projet (pas de `.cursor/mcp.json`,
  `.mcp.json` ou `mcp.json`).
- Aucun token ni credential MCP n'est présent dans le code, le Git ou les règles.

Les MCP servers **n'ont pas été connectés** : ils nécessitent une autorisation manuelle
de ta part. Les étapes exactes sont ci-dessous. Je n'ai rien prétendu configuré.

---

## Architecture cible

```
Cursor
 ├── GitHub        → issues, PR, lecture du dépôt (moindre privilège)
 ├── Supabase      → schéma, migrations, RLS (lecture / dev local)
 ├── Documentation → docs/ + README (recherche)
 └── Filesystem    → accès aux fichiers du workspace (inclus par défaut)
```

### Recommandation de serveurs

| Serveur | Utilité réelle | Déjà installé | Accès recommandé | Recommandé ? |
| --- | --- | --- | --- | --- |
| **Filesystem** | Accès aux fichiers du workspace ; déjà géré par Cursor | ✅ (natif) | workspace uniquement | Oui (par défaut) |
| **GitHub** | Lire issues/PR, proposer des PR, chercher dans le code | ❌ | lecteur + issues, **pas** de token admin | Optionnel |
| **Supabase** | Inspecter schéma/migrations, exécuter en dev local | ❌ | local seulement, **jamais** de clé service | Optionnel |
| **Documentation** | Recherche dans `docs/` + `README.md` | ❌ | accès en lecture | Optionnel |

> ⚠️ N'ajoute pas d'autres serveurs sans vérifier leur utilité réelle. 25 MCP servers
> créent du bruit, des doublons et des risques de permission.

---

## Ce qu'il faut faire toi-même (action manuelle)

### 1. Filesystem (gratuit / natif)

Cursor expose déjà le Filesystem du workspace. Aucune action requise.

### 2. GitHub (optionnel, moindre privilège)

1. Génère un **Personal Access Token (PAT) GitHub** **classique** avec uniquement
   les scopes nécessaires (ex. `repo` **limité** à ce dépôt, ou `public_repo`), ou
   un **Fine-grained token** restreint au dépôt `winner243/saas-starter-v2` en
   **lecture seule** + `issues`.
2. Dans Cursor : **Settings → MCP → Add new MCP server**, type `remote`.
3. Utilise le serveur officiel **`github/github-mcp-server`** (adresse SSE) et colle
   le PAT quand demandé.

Ne crée **jamais** un token avec le scope `admin` ou un accès global à tous tes dépôts.

### 3. Supabase (optionnel, dev local seulement)

1. Dans Cursor : **Settings → MCP → Add new MCP server**, type `remote`.
2. Utilise un MCP Supabase officiel/documenté.
3. Configure-le **uniquement** pour le projet de dev local, avec la **clé anon /
   publishable** et le `SUPABASE_ACCESS_TOKEN` personnel.
4. N'utilise **jamais** la clé `service_role` dans un MCP.

### 4. Documentation (optionnel)

- Peut être couvert par le Filesystem natif (recherche dans `docs/`).
- N'ajoute un MCP dédié que si tu veux interroger une doc externe précise.

---

## Règles de sécurité

- Aucun token MCP ne doit apparaître dans : le code, le Git, `.env.example`, les
  règles Cursor, les logs.
- Tu ne m'afficheras jamais les valeurs de token ; tu dois les coller toi-même dans
  l'interface Cursor.
- Le moindre privilège : chaque outil ne reçoit que l'accès minimum.
- Ne configure pas de serveur MCP avec un accès excessif (ex. accès à tous les repos).

---

## Vérification

Après configuration, vérifie dans Cursor que chaque serveur apparaît **connected** et
que ses outils sont limités. Si un serveur n'est pas connecté, ne le considère pas
configuré.
