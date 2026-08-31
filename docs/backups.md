# Sauvegardes Supabase

Ce document décrit la stratégie de **sauvegarde** et de **restauration** pour le SaaS
Starter V2. La gestion réelle dépend du **plan Supabase** et du **tableau de bord
Supabase** : rien n'est prétendu configuré ici.

---

## Objectif

```
Backup
  → Vérification (disponibilité)
  → Restauration testée
  → Confiance
```

Une sauvegarde qui n'est jamais testée n'est pas une sauvegarde fiable : une
**restauration testée** est la seule façon d'avoir confiance.

---

## Situation actuelle

- **Aucune** politique de sauvegarde n'a été configurée dans ce repo (il n'y a pas
  encore de base métier ni de clip config dans le code).
- La disponibilité des sauvegardes dépend du **plan Supabase** :
  - plan **Free/Pro** : sauvegardes quotidiennes gérées par Supabase (durée de
    rétention selon le plan) ;
  - les points de récupération dans le temps (PITR) dépendent du plan.
- Il faut vérifier dans le **tableau de bord Supabase** l'état réel.

---

## Ce qui doit être sauvegardé

1. **Contenu de la base** — tables et données (via Supabase Backups, planning
   automatisé ou `pg_dump`/`supabase db dump` pour un export manuel).
2. **Migrations** — les fichiers SQL de `supabase/migrations/` (versionnés dans Git :
   ils documentent l'évolution du schéma).
3. **Identifiants / configuration** — les valeurs des variables d'environnement et
   les clés (à stocker hors du repo, jamais dans Git).

## Où vérifier les sauvegardes

- **Supabase Dashboard → Database → Backups** : liste des sauvegardes, leur statut et
  leur disponibilité.

## Comment vérifier leur disponibilité

- Contrôler que des sauvegardes récentes existent (date/heure).
- Vérifier la **rétention** selon le plan.
- Activer le **PITR** si le plan le permet et que le besoin le justifie.

## Comment effectuer une restauration (selon environnement)

- **Dev / Staging** : peut être restaurée depuis une sauvegarde de l'environnement de
  dev/Staging correspondant, ou plus simplement repartir des **migrations** (`supabase
  db push`) + données de test. Idéalement un projet Supabase **séparé** pour dev.
- **Production** : restaurer depuis les **Backups Supabase** ou un **PITR** vers un
  instant précis, sans écraser les données de dev.

⚠️ **Ne jamais lancer de restauration destructive sur une vraie base sans procédure
validée.** Un test de restauration se fait sur un **projet de test (sandbox)**.

## Pourquoi une restauration testée est importante

- Elle valide que la procédure est réelle et reproductible.
- Elle mesure le temps nécessaire au rétablissement.
- Elle garantit que l'on sait **où** et **comment** restaurer le jour où c'est
  nécessaire.

---

## Action manuelle nécessaire

1. Dans **Supabase Dashboard → Backups**, vérifier le plan et les sauvegardes
   existantes.
2. Configurer un projet Supabase de **test** pour un essai de restauration.
3. Documenter la procédure de restauration spécifique à l'environnement choisi.

> Ce Starter ne lance aucune opération de restauration automatique.
