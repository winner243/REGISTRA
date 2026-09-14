export type ExportFormat = "csv" | "json"

export type ExportErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-format"
  | "limit-exceeded"

export interface ExportColumn {
  key: string
  header: string
}

export type ExportRow = Record<string, unknown>

export interface ExportErrorData {
  code: ExportErrorCode
  message: string
}

export interface ChunkedExportOptions {
  format: ExportFormat
  columns?: ExportColumn[]
  maxRows?: number
}