# Export des données

Ce document décrit la couche **réutilisable d'export** du SaaS Starter V2 et les
règles à respecter pour permettre à un futur SaaS d'exporter les données **auxquelles
un utilisateur a réellement accès**.

Il documente aussi le chemin **futur** *Account deletion* / *Data deletion* — sans
implémenter de suppression destructive ici (rien ne la justifie actuellement).

---

## Principes

```
Données utilisateur
        ↓
Export (génération SIDE SERVEUR uniquement)
        ├── CSV   (text/csv, RFC 4180, BOM UTF-8, neutralisation formules)
        └── JSON  (application/json, streaming compact)
```

- La génération se fait **exclusivement côté serveur** : le navigateur ne construit
  jamais le fichier.
- **« Un utilisateur n'exporte que les données auxquelles il a accès »** : l'identité
  vient d'une session vérifiée côté serveur (`getCurrentUser()`), et l'autorisation
  est évaluée par une fonction d'ownership/RLS fournie par le SaaS.
- Un **seul** pipeline (streaming de morceaux) sert tous les formats : pas de systèmes
  séparés par format.
- **PDF : non implémenté.** Aucune librairie de rendu PDF ni cas d'usage ne le
  justifie dans le Starter. Un futur SaaS l'ajoutera à la volée, hors pipeline CSV/JSON,
  selon ses besoins métier.

---

## Architecture (`src/lib/export/`)

| Fichier | Rôle |
| --- | --- |
| `csv.ts` | Sérialisation CSV (échappement, BOM, **neutralisation d'injection de formule** `=`, `+`, `-`, `@`) |
| `json.ts` | Sérialisation JSON (compact ou pretty pour petits volumes) |
| `stream.ts` | `createExportChunks()` : streaming par morceaux + garde-fou `maxRows` |
| `authorize.ts` | `ensureCanExport()` : autorisation / ownership |
| `file.ts` | Nom de fichier sûr (slug + date), `Content-Disposition` RFC 5987, types de contenu |
| `errors.ts` | `ExportError` (codes) + mapping statut HTTP |
| `next.ts` | Glue Route Handler : `exportResponse()`, `exportErrorResponse()` |

### Pipeline

```ts
// Route Handler d'un futur SaaS
import {
  createExportChunks, ensureCanExport, exportResponse, exportErrorResponse,
  toExportReadableStream, buildExportFileName, ExportError,
} from "@/lib/export"

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const user = await getCurrentUser()

  try {
    // 1. Autorisation : identité vérifiée côté serveur + droit d'accès.
    await ensureCanExport(user?.id, async ({ userId }) => {
      // exemple : l'utilisateur ne doit lire que ses propres lignes.
      const { count } = await supabase
        .from("mes_donnees").select("id", { count: "exact", head: true })
        .eq("user_id", userId)
      return count !== 0
    })

    // 2. Source paginée (batch) : jamais tout en mémoire.
    async function* rows() {
      let offset = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from("mes_donnees")
          .select("id,nom,montant")
          .eq("user_id", user.id)
          .range(offset, offset + pageSize - 1)
        if (error || !data?.length) break
        for (const row of data) yield row
        offset += pageSize
      }
    }

    // 3. Streaming du fichier.
    const chunks = createExportChunks(rows(), {
      format: "csv",
      columns: [
        { key: "id", header: "ID" },
        { key: "nom", header: "Nom" },
        { key: "montant", header: "Montant" },
      ],
    })

    return exportResponse(
      toExportReadableStream(chunks),
      { fileName: buildExportFileName("mes-donnees", "csv"), format: "csv" },
    )
  } catch (error) {
    if (error instanceof ExportError) {
      return exportErrorResponse(error)
    }
    throw error
  }
}
```

---

## Sécurité de l'export

| Point | Règle appliquée |
| --- | --- |
| **Identité** | toujours une session **vérifiée côté serveur** (jamais un paramètre client) |
| **Ownership** | `can` reçu par `ensureCanExport` ; le filtre (`eq user_id`) s'applique en base (RLS en filet de sécurité) |
| **Projection** | seules les colonnes **déclarées** sont sérialisées : aucune donnée hors liste ne fuit |
| **Injection CSV** | cellules `=`, `+`, `-`, `@`, tabulation → préfixées par `'` |
| **Nom de fichier** | libellé slugifié (ASCII, borné) ; jamais un chemin client ; `filename*` RFC 5987 |
| **En-têtes HTTP** | `Content-Type` conforme, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` |
| **Erreurs** | aucun détail technique exposé (`ExportError` → message utilisateur ; statut 401/403/415/413) |
| **Limite** | `maxRows` (défaut `100 000`, configurable) → `limit-exceeded` (413) |

### Dépassement de limite pendant le streaming

La garde `maxRows` interrompt le flux avec `ExportError("limit-exceeded")`. Pour
éviter qu'un client reçoive un fichier **partiel**, le SaaS doit choisir selon son
modèle :

- rejeter en amont (`413`) : compter d'abord les lignes éligibles (ex. `HEAD` Supabase)
  et refuser l'export si le quota est dépassé ;
- ou exporter asynchrone (job) avec notification — hors périmètre du Starter.

---

## Volume et pagination

- Le pipeline consomme un **`AsyncIterable`** : la pagination/batch est à la charge de
  l'appelant (boucle `range`/`offset` dans l'exemple ci-dessus).
- Le **streaming** évite de charger l'intégralité en mémoire, quel que soit le format.
- `toJson(rows, true)` (pretty) reste réservé aux **petits volumes** en mémoire ;
  le streaming JSON est toujours compact.

---

## Account deletion / Data deletion (futur, non implémenté)

Le Starter **n'implémente aucune suppression destructive**. La seule table de
fondation (`profiles`) suit l'utilisateur Auth (`ON DELETE CASCADE`) : supprimer un
utilisateur dans Auth supprime déjà son profil.

Un futur SaaS devra documenter, avant toute mise en place :

```
Account deletion        (l'utilisateur ferme son compte)
        ↓
Data deletion           (effacement des données métier liées à l'utilisateur)
        ↓               ├── en cascade au moment du choix
                        ├── ou anonymisation partielle (rétention comptable…)
                        └── ou suppression asynchrone (job) pour les gros volumes
        ↓
Vérification (audit log non-identifiant, délai de grâce éventuel)
        ↓
Suppression définitive (base + backups purgés selon rétention)
```

Règles permanentes :

- ne **jamais** détruire sur une simple requête client sans vérification serveur +
  RLS ;
- n'introduire le soft delete **que** si la récupération est réellement exigée
  (voir `documentation/database.md` → Soft delete) ;
- tout schéma d'effacement passe par une **migration versionnée** + revue.

---

## Tester

```bash
pnpm test    # src/lib/export/export.test.ts
```

Couvert : échappement CSV, injection de formule, projection des colonnes, nom de
fichier sûr, `Content-Disposition`, autorisation (authorized / forbidden /
unauthorized), `maxRows`, sérialisation JSON valide.