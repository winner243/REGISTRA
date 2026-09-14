import type { ExportErrorCode } from "./types"

/**
 * Erreur levée par la couche d'export. Ne contient jamais de détails
 * techniques ni de stack côté client : seul le message est exposé.
 */
export class ExportError extends Error {
  readonly code: ExportErrorCode

  constructor(code: ExportErrorCode, message: string) {
    super(message)
    this.name = "ExportError"
    this.code = code
  }
}

/**
 * Statut HTTP associé à une erreur d'export. Permet aux Route Handlers de
 * mapper une erreur métier vers une réponse HTTP sans exposer de détails.
 */
export function exportErrorToHttpStatus(code: ExportErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 401
    case "forbidden":
      return 403
    case "invalid-format":
      return 415
    case "limit-exceeded":
      return 413
  }
}