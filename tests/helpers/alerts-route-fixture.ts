import { createCipheriv, randomBytes } from "node:crypto"
import { NextRequest } from "next/server"
import type { SendEmailInput } from "../../src/lib/email"
import { hashAlertEmail, hashAlertToken } from "../../src/lib/alerts-shared"

type AlertsServiceRoleClient = unknown

const DEV_ALERTS_TOKEN_ENCRYPTION_KEY = Buffer.from("11".repeat(32), "hex")

export interface CandidateRow {
  id: string
  slug: string
  nome_urna: string
  partido_sigla: string
  cargo_disputado: string
}

interface AlertSubscriberRecordBase {
  id: string
  email: string
  nome: string | null
  verified: boolean
  verified_at: string | null
  verify_token_expires_at: string | null
  manage_token_hash: string
  manage_token_ciphertext: string
  canal_email: boolean
  last_verification_email_sent_at: string | null
  last_digest_sent_at: string | null
}

export interface SubscriberRow extends AlertSubscriberRecordBase {
  email_hash: string
  verify_token_hash: string | null
  manage_token_ciphertext: string
  ip_consentimento_hash: string | null
  /** Balde do teto durável por IP do subscribe; não é o hash de consentimento. */
  last_email_request_ip_hash: string | null
  created_at: string
}

interface SubscriptionRow {
  id: string
  subscriber_id: string
  candidato_id: string
}

export interface NotificationLogRow {
  id: string
  subscriber_id: string
  canal: string
  digest_date: string
  status: string
  error_message: string | null
  sent_at?: string | null
  candidato_ids?: string[]
  change_ids?: string[]
}

interface CandidateChangeRow {
  id: string
  candidato_id: string
  titulo: string
  descricao: string | null
  created_at: string
}

interface AlertsTables {
  candidatos_publico: CandidateRow[]
  alert_subscribers: SubscriberRow[]
  alert_subscriptions: SubscriptionRow[]
  notification_log: NotificationLogRow[]
  candidate_changes: CandidateChangeRow[]
}

type TableName = keyof AlertsTables
type MutationOperation = "update" | "select"

type QueryError = { code?: string; message: string }

type QueryResult<T> = Promise<{ data: T; error: QueryError | null; count?: number | null }>

type QueryOptions = {
  count?: "exact"
  head?: boolean
}

type OrderInstruction = {
  field: string
  ascending: boolean
}

function resolveManageTokenEncryptionKey(): Buffer {
  const raw = process.env.PF_ALERTS_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("Missing PF_ALERTS_TOKEN_ENCRYPTION_KEY")
    }
    return DEV_ALERTS_TOKEN_ENCRYPTION_KEY
  }

  const key = Buffer.from(raw, "hex")
  if (key.length !== 32) {
    throw new Error("PF_ALERTS_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as hex")
  }

  return key
}

function encryptAlertManageTokenForTests(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", resolveManageTokenEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`
}

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function projectColumns<T extends Record<string, unknown>>(row: T, columns: string | null): Partial<T> {
  if (!columns || columns.trim() === "*" || columns.trim().length === 0) {
    return cloneValue(row)
  }

  const keys = columns
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  const projected: Partial<T> = {}
  for (const key of keys) {
    projected[key as keyof T] = cloneValue(row[key as keyof T])
  }
  return projected
}

function toComparable(value: unknown): number | string {
  if (typeof value === "number" || typeof value === "string") return value
  if (value instanceof Date) return value.getTime()
  return String(value ?? "")
}

class SelectMutationQuery<T extends Record<string, unknown>> {
  private filters: Array<(row: T) => boolean> = []
  private orders: OrderInstruction[] = []
  private rangeWindow: { from: number; to: number } | null = null
  private maxRows: number | null = null
  private singleMode: "many" | "single" | "maybeSingle" = "many"

  constructor(
    private readonly fixture: AlertsRouteFixture,
    private readonly tableName: TableName,
    private readonly operation: "select" | "update" | "delete",
    private readonly payload: Record<string, unknown> | null,
    private readonly columns: string | null,
    private readonly options: QueryOptions = {},
  ) {}

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field as keyof T] === value)
    return this
  }

  gt(field: string, value: unknown) {
    this.filters.push((row) => {
      const rowValue = row[field as keyof T]
      return rowValue !== undefined && rowValue !== null && toComparable(rowValue) > toComparable(value)
    })
    return this
  }

  gte(field: string, value: unknown) {
    this.filters.push((row) => {
      const rowValue = row[field as keyof T]
      return rowValue !== undefined && rowValue !== null && toComparable(rowValue) >= toComparable(value)
    })
    return this
  }

  lte(field: string, value: unknown) {
    this.filters.push((row) => {
      const rowValue = row[field as keyof T]
      return rowValue !== undefined && rowValue !== null && toComparable(rowValue) <= toComparable(value)
    })
    return this
  }

  /**
   * Suporte estreito ao `or` do PostgREST: só a forma de keyset que o
   * send-digest emite, `campoA.gt."x",and(campoA.eq."x",campoB.gt."y")`.
   *
   * De propósito não é um parser geral. Um duplo que aceita qualquer expressão e
   * modela metade delas errado é pior do que um que falha alto: o teste passaria
   * afirmando um comportamento que o PostgREST real não tem.
   */
  or(expression: string) {
    const forma =
      /^([a-z_]+)\.gt\.(".*?"|[^,]+),and\(([a-z_]+)\.eq\.(".*?"|[^,)]+),([a-z_]+)\.gt\.(".*?"|[^,)]+)\)$/
    const m = forma.exec(expression)
    if (!m) {
      throw new Error(
        `SelectMutationQuery.or só modela o keyset de duas colunas do send-digest; recebido: ${expression}`,
      )
    }
    const [, campoA, brutoA, campoAEq, brutoAEq, campoB, brutoB] = m
    if (campoA !== campoAEq) {
      throw new Error(`or com colunas incoerentes: ${campoA} e ${campoAEq}`)
    }
    const desaspar = (valor: string) => (valor.startsWith('"') ? JSON.parse(valor) : valor)
    const limiteA = desaspar(brutoA)
    const limiteAEq = desaspar(brutoAEq)
    const limiteB = desaspar(brutoB)
    this.filters.push((row) => {
      const valorA = row[campoA as keyof T]
      const valorB = row[campoB as keyof T]
      if (valorA === undefined || valorA === null) return false
      if (toComparable(valorA) > toComparable(limiteA)) return true
      return (
        toComparable(valorA) === toComparable(limiteAEq) &&
        valorB !== undefined &&
        valorB !== null &&
        toComparable(valorB) > toComparable(limiteB)
      )
    })
    return this
  }

  in(field: string, values: unknown[]) {
    const allowed = new Set(values)
    this.filters.push((row) => allowed.has(row[field as keyof T]))
    return this
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false })
    return this
  }

  range(from: number, to: number) {
    this.rangeWindow = { from, to }
    return this
  }

  limit(value: number) {
    this.maxRows = value
    return this
  }

  // O código de produção encadeia `.abortSignal(supabaseQueryTimeoutSignal())`
  // em toda query; o fixture aceita e ignora, como o PostgREST faria sem rede.
  abortSignal() {
    return this
  }

  maybeSingle() {
    this.singleMode = "maybeSingle"
    return this.execute()
  }

  single() {
    this.singleMode = "single"
    return this.execute()
  }

  then<TResult1 = Awaited<ReturnType<typeof this.execute>>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<ReturnType<typeof this.execute>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private get rows(): T[] {
    return this.fixture.getTable(this.tableName) as unknown as T[]
  }

  private getMatchingRows() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)))

    if (this.orders.length > 0) {
      rows = [...rows].sort((left, right) => {
        for (const order of this.orders) {
          const leftValue = left[order.field as keyof T]
          const rightValue = right[order.field as keyof T]
          if (leftValue === rightValue) continue
          if (leftValue === undefined || leftValue === null) return order.ascending ? -1 : 1
          if (rightValue === undefined || rightValue === null) return order.ascending ? 1 : -1
          if (leftValue < rightValue) return order.ascending ? -1 : 1
          if (leftValue > rightValue) return order.ascending ? 1 : -1
        }
        return 0
      })
    }

    if (this.rangeWindow) {
      rows = rows.slice(this.rangeWindow.from, this.rangeWindow.to + 1)
    }

    if (typeof this.maxRows === "number") {
      rows = rows.slice(0, this.maxRows)
    }

    return rows
  }

  private async execute(): QueryResult<unknown> {
    if (this.operation === "select") {
      const selectError = this.fixture.consumeMutationError(this.tableName, "select")
      if (selectError) {
        return { data: null, error: selectError, count: null }
      }

      const allMatchingRows = this.rows.filter((row) => this.filters.every((filter) => filter(row)))
      const rows = this.getMatchingRows()
      const projectedRows = rows.map((row) => projectColumns(row, this.columns))
      const count = this.options.count === "exact" ? allMatchingRows.length : null

      if (this.options.head) {
        return { data: null, error: null, count }
      }

      if (this.singleMode === "single") {
        return { data: projectedRows[0] ?? null, error: null, count }
      }

      if (this.singleMode === "maybeSingle") {
        return { data: projectedRows[0] ?? null, error: null, count }
      }

      return { data: projectedRows, error: null, count }
    }

    if (this.operation === "update") {
      const mutationError = this.fixture.consumeMutationError(this.tableName, "update")
      if (mutationError) {
        return { data: null, error: mutationError, count: 0 }
      }

      const rows = this.getMatchingRows()
      for (const row of rows) {
        Object.assign(row, cloneValue(this.payload ?? {}))
      }
      return { data: rows.map((row) => cloneValue(row)), error: null, count: rows.length }
    }

    const rows = this.getMatchingRows()
    const table = this.rows
    const idsToDelete = new Set(rows.map((row) => row.id))
    const remaining = table.filter((row) => !idsToDelete.has(row.id))
    this.fixture.setTable(
      this.tableName,
      remaining as unknown as AlertsTables[typeof this.tableName],
    )

    if (this.tableName === "alert_subscribers") {
      this.fixture.setTable(
        "alert_subscriptions",
        this.fixture
          .getTable("alert_subscriptions")
          .filter((row) => !rows.some((subscriber) => subscriber.id === row.subscriber_id)),
      )
      this.fixture.setTable(
        "notification_log",
        this.fixture
          .getTable("notification_log")
          .filter((row) => !rows.some((subscriber) => subscriber.id === row.subscriber_id)),
      )
    }

    return { data: rows.map((row) => cloneValue(row)), error: null, count: rows.length }
  }
}

/**
 * Resultado já resolvido que ainda aceita `.abortSignal()` antes do `await`,
 * como o builder do PostgREST: `upsert` e `rpc` do fixture devolvem isto.
 */
function abortable<T>(promise: Promise<T>): Promise<T> & { abortSignal: (signal: AbortSignal) => Promise<T> } {
  const result = promise as Promise<T> & { abortSignal: (signal: AbortSignal) => Promise<T> }
  result.abortSignal = () => result
  return result
}

class InsertQuery<T extends Record<string, unknown>> {
  private selectedColumns: string | null = null
  private singleMode = false

  constructor(private readonly insertedRows: T[]) {}

  select(columns: string) {
    this.selectedColumns = columns
    return this
  }

  abortSignal() {
    return this
  }

  single() {
    this.singleMode = true
    return this.execute()
  }

  then<TResult1 = Awaited<ReturnType<typeof this.execute>>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<ReturnType<typeof this.execute>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): QueryResult<unknown> {
    const projectedRows = this.insertedRows.map((row) => projectColumns(row, this.selectedColumns))
    if (this.singleMode) {
      return { data: projectedRows[0] ?? null, error: null, count: projectedRows.length }
    }
    return { data: projectedRows, error: null, count: projectedRows.length }
  }
}

export class AlertsRouteFixture {
  private readonly tables: AlertsTables
  private idCounter = 1
  private pendingEmailError: Error | null = null
  private pendingRpcError: QueryError | null = null
  private pendingMutationErrors: Array<{
    tableName: TableName
    operation: MutationOperation
    error: QueryError
  }> = []

  readonly emails: SendEmailInput[] = []
  readonly apiExits: Array<{ route: string; status: number; reason: string; detail?: unknown }> = []
  readonly events: Array<{
    route: string
    event: string
    level?: string
    detail?: Record<string, unknown>
  }> = []

  constructor(seed: Partial<AlertsTables> = {}) {
    this.tables = {
      candidatos_publico: cloneValue(seed.candidatos_publico ?? []),
      alert_subscribers: cloneValue(seed.alert_subscribers ?? []),
      alert_subscriptions: cloneValue(seed.alert_subscriptions ?? []),
      notification_log: cloneValue(seed.notification_log ?? []),
      candidate_changes: cloneValue(seed.candidate_changes ?? []),
    }
  }

  getTable<T extends TableName>(name: T): AlertsTables[T] {
    return this.tables[name]
  }

  setTable<T extends TableName>(name: T, rows: AlertsTables[T]) {
    this.tables[name] = rows
  }

  nextId(prefix: string) {
    const value = `${prefix}_${this.idCounter}`
    this.idCounter += 1
    return value
  }

  failNextEmail(message = "email transport failed") {
    this.pendingEmailError = new Error(message)
  }

  failNextUpdate(tableName: TableName, message = "database update failed") {
    this.pendingMutationErrors.push({
      tableName,
      operation: "update",
      error: { message },
    })
  }

  /**
   * Faz a próxima leitura da tabela devolver erro do PostgREST. Serve para
   * exercitar degradação de coluna ausente (`42703`), o cenário em que o código
   * é deployado antes de a migration ser aplicada.
   */
  failNextSelect(tableName: TableName, error: QueryError) {
    this.pendingMutationErrors.push({
      tableName,
      operation: "select",
      error,
    })
  }

  failNextRpc(error: QueryError) {
    this.pendingRpcError = error
  }

  consumeMutationError(tableName: TableName, operation: MutationOperation) {
    const index = this.pendingMutationErrors.findIndex(
      (pending) => pending.tableName === tableName && pending.operation === operation,
    )
    if (index === -1) return null

    const [pending] = this.pendingMutationErrors.splice(index, 1)
    return pending?.error ?? null
  }

  createClient(): AlertsServiceRoleClient {
    return {
      from: (tableName: TableName) => {
        return {
          select: (columns?: string, options?: QueryOptions) => {
            return new SelectMutationQuery(
              this,
              tableName,
              "select",
              null,
              columns ?? null,
              options,
            )
          },
          update: (payload: Record<string, unknown>) => {
            return new SelectMutationQuery(this, tableName, "update", payload, null)
          },
          delete: () => {
            return new SelectMutationQuery(this, tableName, "delete", null, null)
          },
          insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            const rows = (Array.isArray(payload) ? payload : [payload]).map((row) =>
              this.normalizeInsertedRow(tableName, row),
            )
            ;(this.getTable(tableName) as unknown as Array<Record<string, unknown>>).push(
              ...(rows as Array<Record<string, unknown>>),
            )
            return new InsertQuery(rows)
          },
          upsert: (payload: Record<string, unknown> | Array<Record<string, unknown>>, options?: { onConflict?: string; ignoreDuplicates?: boolean }) =>
            abortable((async () => {
              const rows = Array.isArray(payload) ? payload : [payload]
              for (const row of rows) {
                this.applyUpsert(tableName, row, options)
              }
              return { data: null, error: null, count: rows.length }
            })()),
        }
      },
      rpc: (fn: string, args: Record<string, unknown> = {}) => abortable(this.executeQuotaRpc(fn, args)),
    } as unknown as AlertsServiceRoleClient
  }

  private async executeQuotaRpc(fn: string, args: Record<string, unknown>) {
    const pending = this.pendingRpcError
    this.pendingRpcError = null
    if (pending) return { data: null, error: pending }

    if (fn === "reserve_alert_email_ip_budget") {
      const emailIpHash = String(args.p_email_ip_hash ?? "")
      const sinceIso = String(args.p_since ?? "")
      const max = Number(args.p_max)
      const subscriberId = String(args.p_subscriber_id ?? "")
      const sentAt = String(args.p_sent_at ?? new Date().toISOString())
      const count = this.tables.alert_subscribers.filter(
        (row) =>
          row.last_email_request_ip_hash === emailIpHash &&
          (row.last_verification_email_sent_at ?? "") >= sinceIso,
      ).length
      if (count >= max) return { data: { status: "quota_exceeded" }, error: null }
      const subscriber = this.tables.alert_subscribers.find((row) => row.id === subscriberId)
      if (!subscriber) return { data: { status: "not_found" }, error: null }
      subscriber.last_email_request_ip_hash = emailIpHash
      subscriber.last_verification_email_sent_at = sentAt
      return { data: { status: "reserved" }, error: null }
    }

    if (fn === "insert_alert_subscriber_under_ip_quota") {
      const ipHash = String(args.p_ip_consentimento_hash ?? "")
      const sinceIso = String(args.p_since ?? "")
      const max = Number(args.p_max)
      const count = this.tables.alert_subscribers.filter(
        (row) => row.ip_consentimento_hash === ipHash && row.created_at >= sinceIso,
      ).length
      if (count >= max) return { data: { status: "quota_exceeded" }, error: null }
      const row = this.normalizeInsertedRow("alert_subscribers", {
        email: args.p_email,
        email_hash: args.p_email_hash,
        nome: args.p_nome,
        verify_token_hash: args.p_verify_token_hash,
        verify_token_expires_at: args.p_verify_token_expires_at,
        manage_token_hash: args.p_manage_token_hash,
        manage_token_ciphertext: args.p_manage_token_ciphertext,
        ip_consentimento_hash: ipHash,
      }) as SubscriberRow
      this.tables.alert_subscribers.push(row)
      return { data: { status: "inserted", id: row.id }, error: null }
    }

    return { data: null, error: { message: `unknown rpc ${fn}` } }
  }

  private normalizeInsertedRow(tableName: TableName, row: Record<string, unknown>) {
    if (tableName === "alert_subscribers") {
      const subscriber = row as Partial<SubscriberRow>
      return {
        id: subscriber.id ?? this.nextId("sub"),
        email: subscriber.email ?? "",
        email_hash: subscriber.email_hash ?? hashAlertEmail(subscriber.email ?? ""),
        nome: subscriber.nome ?? null,
        verified: subscriber.verified ?? false,
        verified_at: subscriber.verified_at ?? null,
        verify_token_hash: subscriber.verify_token_hash ?? null,
        verify_token_expires_at: subscriber.verify_token_expires_at ?? null,
        manage_token_hash: subscriber.manage_token_hash ?? hashAlertToken(this.nextId("manage")),
        manage_token_ciphertext:
          subscriber.manage_token_ciphertext ?? encryptAlertManageTokenForTests(this.nextId("manage")),
        canal_email: subscriber.canal_email ?? true,
        last_verification_email_sent_at: subscriber.last_verification_email_sent_at ?? null,
        last_digest_sent_at: subscriber.last_digest_sent_at ?? null,
        ip_consentimento_hash: subscriber.ip_consentimento_hash ?? null,
        last_email_request_ip_hash: subscriber.last_email_request_ip_hash ?? null,
        created_at: subscriber.created_at ?? new Date().toISOString(),
      } satisfies SubscriberRow
    }

    if (tableName === "alert_subscriptions") {
      const subscription = row as Partial<SubscriptionRow>
      return {
        id: subscription.id ?? this.nextId("asub"),
        subscriber_id: subscription.subscriber_id ?? "",
        candidato_id: subscription.candidato_id ?? "",
      } satisfies SubscriptionRow
    }

    if (tableName === "notification_log") {
      const logRow = row as Partial<NotificationLogRow>
      return {
        id: logRow.id ?? this.nextId("nlog"),
        subscriber_id: logRow.subscriber_id ?? "",
        canal: logRow.canal ?? "email",
        digest_date: logRow.digest_date ?? "",
        status: logRow.status ?? "pending",
        error_message: logRow.error_message ?? null,
        sent_at: logRow.sent_at ?? null,
        candidato_ids: cloneValue(logRow.candidato_ids ?? []),
        change_ids: cloneValue(logRow.change_ids ?? []),
      } satisfies NotificationLogRow
    }

    if (tableName === "candidate_changes") {
      const change = row as Partial<CandidateChangeRow>
      return {
        id: change.id ?? this.nextId("chg"),
        candidato_id: change.candidato_id ?? "",
        titulo: change.titulo ?? "",
        descricao: change.descricao ?? null,
        created_at: change.created_at ?? new Date().toISOString(),
      } satisfies CandidateChangeRow
    }

    return {
      id: (row.id as string | undefined) ?? this.nextId("cand"),
      slug: (row.slug as string | undefined) ?? "",
      nome_urna: (row.nome_urna as string | undefined) ?? "",
      partido_sigla: (row.partido_sigla as string | undefined) ?? "",
      cargo_disputado: (row.cargo_disputado as string | undefined) ?? "",
    } satisfies CandidateRow
  }

  private applyUpsert(
    tableName: TableName,
    row: Record<string, unknown>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    if (tableName === "alert_subscriptions" && options?.onConflict === "subscriber_id,candidato_id") {
      const existing = this.tables.alert_subscriptions.find(
        (subscription) =>
          subscription.subscriber_id === row.subscriber_id &&
          subscription.candidato_id === row.candidato_id,
      )
      if (existing && options.ignoreDuplicates) {
        return
      }
      if (existing) {
        Object.assign(existing, cloneValue(row))
        return
      }
      this.tables.alert_subscriptions.push(
        this.normalizeInsertedRow(tableName, row) as SubscriptionRow,
      )
      return
    }

    const normalizedRow = this.normalizeInsertedRow(tableName, row)
    const existingIndex = "id" in normalizedRow
      ? this.getTable(tableName).findIndex((item) => item.id === normalizedRow.id)
      : -1

    if (existingIndex >= 0) {
      Object.assign(this.getTable(tableName)[existingIndex], cloneValue(normalizedRow))
      return
    }

    ;(this.getTable(tableName) as unknown as Array<Record<string, unknown>>).push(
      normalizedRow as Record<string, unknown>,
    )
  }

  async findPublicCandidateBySlug(slug: string) {
    return cloneValue(
      this.tables.candidatos_publico.find((candidate) => candidate.slug === slug) ?? null,
    )
  }

  async findSubscriberByEmailHash(emailHash: string) {
    return this.toSubscriberRecord(
      this.tables.alert_subscribers.find((subscriber) => subscriber.email_hash === emailHash) ?? null,
    )
  }

  async findSubscriberByManageToken(manageToken: string) {
    const manageTokenHash = hashAlertToken(manageToken)
    return this.toSubscriberRecord(
      this.tables.alert_subscribers.find((subscriber) => subscriber.manage_token_hash === manageTokenHash) ?? null,
    )
  }

  async findSubscriberByVerifyAndManageToken(verifyToken: string, manageToken: string) {
    const verifyTokenHash = hashAlertToken(verifyToken)
    const manageTokenHash = hashAlertToken(manageToken)
    return this.toSubscriberRecord(
      this.tables.alert_subscribers.find(
        (subscriber) =>
          subscriber.verify_token_hash === verifyTokenHash &&
          subscriber.manage_token_hash === manageTokenHash,
      ) ?? null,
    )
  }

  async sendTransactionalEmail(input: SendEmailInput) {
    const error = this.pendingEmailError
    this.pendingEmailError = null
    if (error) throw error

    this.emails.push(cloneValue(input))
    return { id: `email_${this.emails.length}` }
  }

  logAlertsApiExit = (route: string, status: number, reason: string, detail?: unknown) => {
    this.apiExits.push({ route, status, reason, detail })
  }

  logAlertsEvent = (input: {
    route: string
    event: string
    level?: string
    detail?: Record<string, unknown>
  }) => {
    this.events.push(cloneValue(input))
  }

  request(
    path: string,
    options: {
      method?: string
      body?: unknown
      headers?: Record<string, string>
      cookies?: Record<string, string>
      rawBody?: string
    } = {},
  ) {
    const headers = new Headers(options.headers)
    const cookieHeader = Object.entries(options.cookies ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("; ")

    if (cookieHeader) {
      headers.set("cookie", cookieHeader)
    }

    let body: string | undefined
    if (typeof options.rawBody === "string") {
      body = options.rawBody
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body)
    }

    if (body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json")
    }

    return new NextRequest(`http://localhost${path}`, {
      method: options.method ?? "POST",
      headers,
      body,
    })
  }

  extractAccessUrls(index = 0) {
    const text = this.emails[index]?.text ?? ""
    return Array.from(text.matchAll(/https:\/\/puxaficha\.com\.br\/alertas\/acesso\?[^\s]+/g)).map(
      (match) => match[0],
    )
  }

  private toSubscriberRecord(subscriber: SubscriberRow | null): AlertSubscriberRecordBase | null {
    if (!subscriber) return null

    return cloneValue({
      id: subscriber.id,
      email: subscriber.email,
      nome: subscriber.nome,
      verified: subscriber.verified,
      verified_at: subscriber.verified_at,
      verify_token_expires_at: subscriber.verify_token_expires_at,
      manage_token_hash: subscriber.manage_token_hash,
      manage_token_ciphertext: subscriber.manage_token_ciphertext,
      canal_email: subscriber.canal_email,
      last_verification_email_sent_at: subscriber.last_verification_email_sent_at,
      last_digest_sent_at: subscriber.last_digest_sent_at,
    })
  }
}

export function seedCandidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: overrides.id ?? "cand_lula",
    slug: overrides.slug ?? "lula",
    nome_urna: overrides.nome_urna ?? "Lula",
    partido_sigla: overrides.partido_sigla ?? "PT",
    cargo_disputado: overrides.cargo_disputado ?? "Presidente",
  }
}

export function seedSubscriber(
  input: Partial<SubscriberRow> & {
    email?: string
    manageToken?: string
    verifyToken?: string
  } = {},
): SubscriberRow {
  const email = input.email ?? "eleitor@example.com"
  const manageToken = input.manageToken ?? "ManageTokenAlpha123"
  const verifyToken = input.verifyToken ?? "VerifyTokenAlpha123"

  return {
    id: input.id ?? "sub_1",
    email,
    email_hash: input.email_hash ?? hashAlertEmail(email),
    nome: input.nome ?? null,
    verified: input.verified ?? false,
    verified_at: input.verified_at ?? null,
    verify_token_hash:
      input.verify_token_hash === undefined
        ? hashAlertToken(verifyToken)
        : input.verify_token_hash,
    verify_token_expires_at: input.verify_token_expires_at ?? "2026-04-12T15:00:00.000Z",
    manage_token_hash: input.manage_token_hash ?? hashAlertToken(manageToken),
    manage_token_ciphertext:
      input.manage_token_ciphertext ?? encryptAlertManageTokenForTests(manageToken),
    canal_email: input.canal_email ?? true,
    last_verification_email_sent_at: input.last_verification_email_sent_at ?? null,
    last_digest_sent_at: input.last_digest_sent_at ?? null,
    ip_consentimento_hash: input.ip_consentimento_hash ?? null,
    last_email_request_ip_hash: input.last_email_request_ip_hash ?? null,
    created_at: input.created_at ?? "2026-04-08T10:00:00.000Z",
  }
}
