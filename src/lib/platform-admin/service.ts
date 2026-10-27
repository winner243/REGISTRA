/**
 * Service privilégié Super Admin — lectures globales REGISTRA.
 *
 * ## Pourquoi ce module existe
 *
 * Les politiques RLS sont volontairement strictes : un utilisateur classique ne
 * voit QUE ses organisations. C'est le comportement attendu et il n'est pas
 * question de l'affaiblir. En revanche, le Super Admin de plateforme doit
 * consulter l'intégralité de la donnée, indépendamment de ses appartenances.
 *
 * ## Modèle de confiance retenu
 *
 * Ce module est le SEUL point du code applicatif autorisé à obtenir le client
 * `service_role` (qui contourne RLS) pour de la lecture métier. Il applique,
 * dans cet ordre impératif :
 *
 *   1. `requirePlatformAdmin()` — session vérifiée côté serveur par GoTrue
 *      (`supabase.auth.getUser()`) + claim `app_metadata.platform_admin === true`.
 *      Deny by default : sans claim exact, redirection, aucune donnée n'est lue.
 *   2. Fabrication du client privilégié, uniquement après le contrôle.
 *
 * ## Invariants à préserver
 *
 *   - La fabrique de client n'est PAS exportée : aucun autre module ne peut
 *     obtenir `service_role` par l'intermédiaire de ce fichier. Le seul surface
 *     public est une liste blanche finie d'opérations nommées.
 *   - Toute opération, lecture COMME écriture, passe par `privilegedClient()`,
 *     donc par `requirePlatformAdmin()`. Il n'existe aucun chemin d'accès au
 *     client privilégié qui n'ait pas d'abord vérifié le claim côté serveur.
 *   - Les écritures sont réduites au strict minimum justifié par les contrats
 *     existants (aujourd'hui : le nom et le type d'un établissement, soit la
 *     seule action « modifier » que l'interface admin propose). Aucune
 *     écriture destructive (pas de suppression), aucun droit ni aucun rôle
 *     n'est modifiable ici : le risque d'escalade de privilèges est écarté en
 *     ne proposant pas l'action.
 *   - Les politiques RLS ne sont jamais modifiées ici : `service_role` sert à
 *     contourner la RLS pour un opérateur déjà authentifié et autorisé, pas à
 *     l'affaiblir pour quiconque.
 *   - La clé `service_role` ne quitte jamais le serveur : ce module n'est
 *     jamais importé par un composant client (pas de "use client", aucune
 *     donnée renvoyée au navigateur autre que le résultat des opérations).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { requirePlatformAdmin } from "@/lib/auth/platform-admin"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { ORG_TYPES } from "@/lib/registra/vocab"

/** Codes d'erreur du service : distincts pour permettre un rendu honnête. */
export type PlatformAdminErrorCode =
  | "not_configured"
  | "query_failed"
  | "invalid_input"
  | "not_found"

export class PlatformAdminError extends Error {
  constructor(
    readonly code: PlatformAdminErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "PlatformAdminError"
  }
}

/**
 * Obtient le client privilégié APRÈS vérification du claim.
 *
 * Non exportée volontairement : c'est la seule porte d'accès à `service_role`
 * dans l'application, et elle est refermée dès que la fonction retourne.
 */
async function privilegedClient(): Promise<SupabaseClient> {
  // 1. Contrôle d'accès — déclenche une redirection en cas de refus.
  await requirePlatformAdmin()

  // 2. Client privilégié — jamais de fallback silencieux.
  const client = await createSupabaseAdminClient()
  if (!client) {
    throw new PlatformAdminError(
      "not_configured",
      "Le client d'administration n'est pas configuré sur ce serveur.",
    )
  }

  return client
}

/** Exécute une lecture et remonte toute erreur comme `PlatformAdminError`. */
async function read<T>(
  run: (client: SupabaseClient) => PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const client = await privilegedClient()
  const { data, error } = await run(client)
  if (error) {
    throw new PlatformAdminError("query_failed", error.message)
  }
  return data
}

/* -------------------------------------------------------------------------- */
/*  Types de sortie — volontairement plats, sans donnée sensible               */
/* -------------------------------------------------------------------------- */

export type PlatformOrganization = {
  id: string
  name: string
  createdAt: string
  createdBy: string | null
  /** Nombre réel de membres (compté sur `memberships`). */
  memberCount: number
  /** Type REGISTRA, `null` quand aucun réglage n'existe pour l'organisation. */
  orgType: string | null
  /** Abonnement courant, `null` si l'organisation n'a jamais eu d'abonnement. */
  planCode: string | null
  subscriptionStatus: string | null
  /** Absence d'abonnement, explicite pour éviter tout faux « actif ». */
  hasSubscription: boolean
}

export type PlatformUser = {
  id: string
  email: string
  createdAt: string
  lastSignInAt: string | null
  /** Profil applicatif — peut être absent (compte Auth sans profil). */
  fullName: string | null
  hasProfile: boolean
  /** Claim de plateforme, lu depuis `app_metadata` (source fiable). */
  platformAdmin: boolean
  memberships: Array<{ organizationId: string; organizationName: string; role: string }>
}

export type PlatformSubscription = {
  id: string
  organizationId: string
  organizationName: string
  planCode: string
  planName: string | null
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

export type PlatformStats = {
  organizations: number
  users: number
  memberships: number
  groups: number
  persons: number
  attendanceRecords: number
  subscriptionsByStatus: Record<string, number>
  orgsWithSubscription: number
}

export type PlatformAttendanceRow = {
  id: string
  recordDate: string
  status: string
  organizationId: string
  organizationName: string
  groupName: string | null
  personName: string | null
}

/* -------------------------------------------------------------------------- */
/*  Lectures                                                                   */
/* -------------------------------------------------------------------------- */

const ORG_COLUMNS = "id,name,created_by,created_at"

/**
 * Ensemble des établissements de la plateforme, enrichis de leurs membres,
 * de leur type REGISTRA et de leur abonnement.
 */
export async function listPlatformOrganizations(): Promise<PlatformOrganization[]> {
  const [organizations, memberships, settings, subscriptions] = await Promise.all([
    read((c) => c.from("organizations").select(ORG_COLUMNS).order("name")),
    read((c) => c.from("memberships").select("organization_id")),
    read((c) =>
      c.from("organization_registra_settings").select("organization_id,organization_type"),
    ),
    read((c) =>
      c.from("subscriptions").select(
        "organization_id,plan_code,status,current_period_start,current_period_end",
      ),
    ),
  ])

  const memberCount = new Map<string, number>()
  for (const m of memberships ?? []) {
    memberCount.set(m.organization_id, (memberCount.get(m.organization_id) ?? 0) + 1)
  }

  const typeByOrg = new Map<string, string>()
  for (const s of settings ?? []) {
    typeByOrg.set(s.organization_id, s.organization_type)
  }

  // Un abonnement par organisation (la table n'en porte qu'un « courant ») ;
  // on garde le plus récent si un historique apparaissait un jour.
  const subByOrg = new Map<
    string,
    { plan_code: string; status: string; current_period_start: string; current_period_end: string }
  >()
  for (const s of subscriptions ?? []) {
    const previous = subByOrg.get(s.organization_id)
    if (!previous || s.current_period_start > previous.current_period_start) {
      subByOrg.set(s.organization_id, s)
    }
  }

  return (organizations ?? []).map((o) => {
    const sub = subByOrg.get(o.id) ?? null
    return {
      id: o.id,
      name: o.name,
      createdAt: o.created_at,
      createdBy: o.created_by ?? null,
      memberCount: memberCount.get(o.id) ?? 0,
      orgType: typeByOrg.get(o.id) ?? null,
      planCode: sub?.plan_code ?? null,
      subscriptionStatus: sub?.status ?? null,
      hasSubscription: sub !== null,
    }
  })
}

/**
 * Comptes Auth de la plateforme, joints à leur profil applicatif et à leurs
 * appartenances.
 *
 * Les comptes Auth (`auth.users`) et les profils (`public.profiles`) sont deux
 * entités distinctes : un compte peut exister sans profil, et un profil sans
 * compte. L'écart est exposé (`hasProfile`) au lieu d'être masqué.
 */
export async function listPlatformUsers(): Promise<PlatformUser[]> {
  const client = await privilegedClient()

  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) {
    throw new PlatformAdminError("query_failed", error.message)
  }

  const [profiles, memberships, organizations] = await Promise.all([
    read((c) => c.from("profiles").select("id,full_name")),
    read((c) => c.from("memberships").select("organization_id,user_id,role")),
    read((c) => c.from("organizations").select("id,name")),
  ])

  const fullNameById = new Map<string, string | null>()
  for (const p of profiles ?? []) {
    fullNameById.set(p.id, p.full_name ?? null)
  }

  const orgNameById = new Map<string, string>()
  for (const o of organizations ?? []) {
    orgNameById.set(o.id, o.name)
  }

  return (data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    fullName: fullNameById.has(u.id) ? fullNameById.get(u.id) ?? null : null,
    hasProfile: fullNameById.has(u.id),
    platformAdmin:
      (u.app_metadata as Record<string, unknown> | undefined)?.platform_admin === true,
    memberships: (memberships ?? [])
      .filter((m) => m.user_id === u.id)
      .map((m) => ({
        organizationId: m.organization_id,
        organizationName: orgNameById.get(m.organization_id) ?? m.organization_id,
        role: m.role,
      })),
  }))
}

/** Abonnements de la plateforme, avec nom d'établissement et libellé de plan. */
export async function listPlatformSubscriptions(): Promise<PlatformSubscription[]> {
  const [subscriptions, organizations, plans] = await Promise.all([
    read((c) =>
      c
        .from("subscriptions")
        .select(
          "id,organization_id,plan_code,status,current_period_start,current_period_end,cancel_at_period_end",
        )
        .order("created_at", { ascending: false }),
    ),
    read((c) => c.from("organizations").select("id,name")),
    read((c) => c.from("plans").select("code,name")),
  ])

  const orgNameById = new Map<string, string>()
  for (const o of organizations ?? []) {
    orgNameById.set(o.id, o.name)
  }
  const planNameByCode = new Map<string, string>()
  for (const p of plans ?? []) {
    planNameByCode.set(p.code, p.name)
  }

  return (subscriptions ?? []).map((s) => ({
    id: s.id,
    organizationId: s.organization_id,
    organizationName: orgNameById.get(s.organization_id) ?? s.organization_id,
    planCode: s.plan_code,
    planName: planNameByCode.get(s.plan_code) ?? null,
    status: s.status,
    currentPeriodStart: s.current_period_start,
    currentPeriodEnd: s.current_period_end,
    cancelAtPeriodEnd: s.cancel_at_period_end,
  }))
}

/** Compteurs réels de la plateforme. Aucune valeur n'est estimée ou simulée. */
export async function getPlatformStats(): Promise<PlatformStats> {
  const [orgs, memberships, groups, persons, records, subs, users] = await Promise.all([
    read((c) => c.from("organizations").select("id")),
    read((c) => c.from("memberships").select("id")),
    read((c) => c.from("groups").select("id")),
    read((c) => c.from("persons").select("id")),
    read((c) => c.from("attendance_records").select("id")),
    read((c) => c.from("subscriptions").select("id,status")),
    (async () => {
      const client = await privilegedClient()
      const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (error) throw new PlatformAdminError("query_failed", error.message)
      return data?.users ?? []
    })(),
  ])

  const subscriptionsByStatus: Record<string, number> = {}
  for (const s of subs ?? []) {
    subscriptionsByStatus[s.status] = (subscriptionsByStatus[s.status] ?? 0) + 1
  }

  return {
    organizations: orgs?.length ?? 0,
    users: users.length,
    memberships: memberships?.length ?? 0,
    groups: groups?.length ?? 0,
    persons: persons?.length ?? 0,
    attendanceRecords: records?.length ?? 0,
    subscriptionsByStatus,
    orgsWithSubscription: subs?.length ?? 0,
  }
}

/**
 * Présences récentes de la plateforme, avec noms résolus.
 *
 * Ce n'est PAS un journal d'audit : la table `attendance_records` ne contient
 * que des pointages de présence. Aucun événement d'administration n'y est
 * tracé, et aucune table d'audit n'existe dans le schéma.
 */
export async function listPlatformAttendance(limit = 100): Promise<PlatformAttendanceRow[]> {
  const [records, organizations, groups, persons] = await Promise.all([
    read((c) =>
      c
        .from("attendance_records")
        .select("id,record_date,status,organization_id,group_id,person_id")
        .order("created_at", { ascending: false })
        .limit(limit),
    ),
    read((c) => c.from("organizations").select("id,name")),
    read((c) => c.from("groups").select("id,name")),
    read((c) => c.from("persons").select("id,first_name,last_name")),
  ])

  const orgName = new Map<string, string>()
  for (const o of organizations ?? []) orgName.set(o.id, o.name)
  const groupName = new Map<string, string>()
  for (const g of groups ?? []) groupName.set(g.id, g.name)
  const personName = new Map<string, string>()
  for (const p of persons ?? []) personName.set(p.id, `${p.first_name} ${p.last_name}`.trim())

  return (records ?? []).map((r) => ({
    id: r.id,
    recordDate: r.record_date,
    status: r.status,
    organizationId: r.organization_id,
    organizationName: orgName.get(r.organization_id) ?? r.organization_id,
    groupName: groupName.get(r.group_id) ?? null,
    personName: personName.get(r.person_id) ?? null,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Rôles (lecture — justifiée par les contrats `roles`, `permissions`,        */
/*  `role_permissions`)                                                       */
/* -------------------------------------------------------------------------- */

export type PlatformRolePermission = {
  name: string
  description: string | null
}

export type PlatformRole = {
  name: string
  description: string | null
  /** Nombre de membres portant ce rôle dans toutes les organisations. */
  memberCount: number
  permissions: PlatformRolePermission[]
}

/**
 * Liste les rôles, leurs permissions et leur effectif réel.
 *
 * Lecture seule : la modification des rôles/permissions est globale (elle
 * toucherait toutes les organisations) et n'est pas exposée dans l'interface
 * actuelle. Masquer l'action plutôt que de la simuler.
 */
export async function listPlatformRoles(): Promise<PlatformRole[]> {
  // `read()` fabrique lui-même le client privilégié : la garde s'exécute donc
  // une fois par requête, comme pour toutes les autres lectures.
  const [roles, permissions, rolePermissions, memberships] = await Promise.all([
    read((c) => c.from("roles").select("name,description")),
    read((c) => c.from("permissions").select("name,description")),
    read((c) => c.from("role_permissions").select("role,permission")),
    read((c) => c.from("memberships").select("role")),
  ])

  const permissionName = new Map<string, PlatformRolePermission>()
  for (const p of permissions ?? []) {
    permissionName.set(p.name, { name: p.name, description: p.description })
  }

  const permissionsByRole = new Map<string, PlatformRolePermission[]>()
  for (const rp of rolePermissions ?? []) {
    const perm = permissionName.get(rp.permission)
    if (!perm) continue
    const list = permissionsByRole.get(rp.role) ?? []
    list.push(perm)
    permissionsByRole.set(rp.role, list)
  }

  const membersByRole = new Map<string, number>()
  for (const m of memberships ?? []) {
    membersByRole.set(m.role, (membersByRole.get(m.role) ?? 0) + 1)
  }

  return (roles ?? []).map((r) => ({
    name: r.name,
    description: r.description,
    memberCount: membersByRole.get(r.name) ?? 0,
    permissions: (permissionsByRole.get(r.name) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }))
}

/* -------------------------------------------------------------------------- */
/*  Écritures                                                                  */
/* -------------------------------------------------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Nom d'établissement accepté : 2 à 120 caractères après suppression des bords. */
export const ORGANIZATION_NAME_MIN = 2
export const ORGANIZATION_NAME_MAX = 120

/** Types REGISTRA autorisés — source unique : `ORG_TYPES` (le CHECK de la table). */
const ORG_TYPE_VALUES: ReadonlySet<string> = new Set(ORG_TYPES.map((t) => t.value))

/**
 * Type REGISTRA accepté, ou `undefined` pour ne pas toucher aux réglages.
 *
 * `undefined` = « aucun réglage à modifier ». Ce n'est PAS un effacement :
 * `organization_registra_settings.organization_type` est `NOT NULL` (défaut
 * `other`) et la table ne possède aucune politique de suppression. On choisit
 * donc de ne jamais supprimer de ligne plutôt que de simuler un état vide.
 */
function assertOrgType(value: string | undefined): void {
  if (value === undefined) return
  if (!ORG_TYPE_VALUES.has(value)) {
    throw new PlatformAdminError(
      "invalid_input",
      "Type d'établissement invalide.",
    )
  }
}

/**
 * Met à jour un établissement : son nom et, éventuellement, son type REGISTRA.
 *
 * C'est la seule opération d'écriture exposée par ce module, et elle
 * correspond à l'action « modifier » que l'interface admin propose réellement.
 *
 * Sécurité — dans cet ordre :
 *   1. Validation de **toutes** les entrées avant le moindre accès à la base
 *      (règle 40-security) : nom, identifiant, type.
 *   2. `privilegedClient()` → `requirePlatformAdmin()`, donc le claim est
 *      revérifié côté serveur **pour cette opération**, pas seulement au
 *      rendu de la page. Un appel direct au Server Action sans claim échoue.
 *   3. Écritures ciblées : `organizations.name` et l'upsert des réglages
 *      (1:1, `onConflict: organization_id`). Aucune autre colonne.
 *
 * `updated_at` est géré par les triggers `handle_organizations_updated_at` et
 * `handle_org_registra_settings_updated_at`.
 *
 * Note d'atomicité : sans RPC (donc sans migration, interdite ici), les deux
 * écritures ne peuvent être liées par une transaction. Elles sont sérialisées
 * et validées avant toute écriture, de sorte qu'une erreur de validation ne
 * laisse jamais d'état partiel — seul un incident base en cours reste possible.
 *
 * Ce module ne supprime rien : la suppression d'un établissement détruirait en
 * cascade ses membres, présences et abonnements. Elle nécessite une
 * autorisation explicite et n'est donc pas implémentée.
 */
export async function updatePlatformOrganization(input: {
  id: string
  name: string
  /** Type REGISTRA à écrire ; omis pour ne pas modifier les réglages. */
  organizationType?: string
}): Promise<void> {
  const name = input.name.trim()
  if (name.length < ORGANIZATION_NAME_MIN || name.length > ORGANIZATION_NAME_MAX) {
    throw new PlatformAdminError(
      "invalid_input",
      `Le nom doit contenir entre ${ORGANIZATION_NAME_MIN} et ${ORGANIZATION_NAME_MAX} caractères.`,
    )
  }
  if (!UUID_RE.test(input.id)) {
    throw new PlatformAdminError("invalid_input", "Identifiant d'établissement invalide.")
  }
  assertOrgType(input.organizationType)

  // Contrôle d'accès : vérifié ICI, pour cette opération.
  const client = await privilegedClient()

  if (input.organizationType !== undefined) {
    const { error: settingsError } = await client
      .from("organization_registra_settings")
      .upsert(
        {
          organization_id: input.id,
          organization_type: input.organizationType,
        },
        { onConflict: "organization_id" },
      )

    if (settingsError) {
      throw new PlatformAdminError("query_failed", settingsError.message)
    }
  }

  const { data, error } = await client
    .from("organizations")
    .update({ name })
    .eq("id", input.id)
    .select("id")

  if (error) {
    throw new PlatformAdminError("query_failed", error.message)
  }
  if (!data || data.length === 0) {
    throw new PlatformAdminError("not_found", "Établissement introuvable.")
  }
}
