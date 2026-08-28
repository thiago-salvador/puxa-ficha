export declare const REGIOES: Record<string, string[]>
export declare const UFS_NORTE: string[]
export declare const UFS_RESTANTES: string[]
export declare const LIMITE_CONCORRENCIA: number
export declare const LIMITE_SLOTS_GERADOR: number
export declare const MAX_MULTIPASSAGEM_SIMULTANEOS: number
export declare const MAX_TENTATIVAS_CANDIDATO: number
export declare const PASSAGENS_CONCORRENCIA_INTERNA: number
export declare const DISPAROS_RAMPA: { para4: number; fimRampa: number }
export declare const THROUGHPUT_NORTE_CAND_H: number
export declare const PLANNER_VERSION: string
export declare const LEASE_TIMEOUT_MS: number

export declare type LeaseExecucao = {
  caminho: string
  executionId: string
  pararHeartbeat: () => void
}

export declare function adquirirLeaseExecucao(runDir: string, options?: {
  executionId?: string
  pid?: number
  hostname?: string
  now?: () => number
  timeoutMs?: number
  pidAtivo?: (pid: number) => boolean
  heartbeatMs?: number
}): Promise<LeaseExecucao>
export declare function liberarLeaseExecucao(lease: LeaseExecucao | null | undefined): Promise<void>

export declare function eErroCota(texto: unknown): boolean
export declare function regiaoDaUf(uf: string): string | null
export declare function slotsDeItem(item: { multipassagem: boolean; passagensPlanejadas?: number }): number
export declare function classificarRegistro(registro: unknown): { estado: "complete" | "blocked" | "retryable_error"; motivo: string }
export declare function reconciliarParaRetomada(params: {
  registro: unknown
  estadoAnterior: { estado: string; tentativas?: number; familia?: string | null; familiaDaUltimaTentativa?: string | null; modeloDaUltimaTentativa?: string | null; familiaPlanejada?: string | null; executionId?: string; fase?: string; tentativa?: number; motivo?: string } | null
  familiaAtual: string | null
  modeloAtual?: string | null
}): { estado: "complete" | "blocked" | "retryable_error" | "pending"; motivo: string; tentativas: number; familia: string | null; familiaDaUltimaTentativa: string | null; modeloDaUltimaTentativa: string | null; familiaPlanejada: string | null; modeloPlanejado: string | null }

export declare function escaladaPermitida(metricas: {
  errosCota: number
  tentativas: number
  conclusoes?: number
  errosTecnicos: number
  latenciaP95Ultimos?: number
  latenciaP95Base?: number
} | null | undefined): boolean

export declare function definirProbeRecursos(fn: () => boolean): void
export declare function concorrenciaAlvo(params: {
  conclusoes: number
  concorrenciaAtual: number
  metricas: Parameters<typeof escaladaPermitida>[0]
}): number

export declare function dirDoCandidato(runDir: string, item: { chaveCacheDir: string }): string
export declare function caminhoRegistro(runDir: string, item: { chaveCacheDir: string; uf: string; slug: string | null; sqCandidato: string }): string
export declare function lerRegistro(runDir: string, item: Parameters<typeof caminhoRegistro>[1]): Promise<unknown>

export declare function resolverNode24(runDir: string): Promise<string>

export declare function validarFilaContraInventario(itens: Array<{ uf: string; chave?: string }>, inventoryPath: string): Promise<void>

export declare type ExecutarBatchParams = {
  runDir: string
  inventoryPath: string
  workDir: string
  archiveDir?: string
  modelsConfig?: string
  maxMinutos?: number
  pollMs?: number
  spawnFn?: (bin: string, args: string[], opts: { cwd: string; env?: Record<string, string>; stdio: string[] }) => {
    stderr?: { on(event: "data", listener: (chunk: Buffer) => void): void } | undefined
    on(event: "close", listener: (code: number | null) => void): void
    on(event: "error", listener: (erro: Error) => void): void
  }
  node24Resolver?: (runDir: string) => Promise<string>
  qwenExtraArgs?: string
  codexExtraArgs?: string
  filaPath?: string
  validarFilaFn?: (itens: Array<Record<string, unknown>>) => Promise<void>
  planejarItensFn?: () => Promise<Array<Record<string, unknown>>>
  leaseOptions?: Record<string, unknown>
}

export declare function executarBatch(params: ExecutarBatchParams): Promise<{
  parada: string | null
  total: number
  concluidos: number
  bloqueados: number
  concluidosAtuais: number
  bloqueadosAtuais: number
  tentativas: number
  errosTecnicos: number
  errosCota: number
  concorrenciaFinal: number
  quota: "normal" | "draining_after_quota" | "single_probe" | "stopped_by_quota"
}>

export declare function calcularFingerprintFila(itens: Array<Record<string, unknown>>, plannerVersion?: string): string
export declare function validarFilaPlanejada(itens: Array<Record<string, unknown>>, planejados: Array<Record<string, unknown>> | null, manifesto: Record<string, unknown> | null): void
export declare function criarContadoresExecucao(historicos?: { concluidos?: number; bloqueados?: number }): Record<string, number>
export declare function criarControleQuota(): { estado: string; falhasQuota: number }
export declare function prepararProvaQuota(controle: { estado: string; falhasQuota: number }, emVoo: number): { estado: string; falhasQuota: number }
export declare function registrarResultadoQuota(controle: { estado: string; falhasQuota: number }, resultado: { tipo: "quota" | "sucesso" | "erro_tecnico" }): { estado: string; falhasQuota: number }
export declare function concorrenciaPermitidaPorQuota(controle: { estado: string }, emVoo: number, concorrencia: number): number
export declare function gravarEstado(runDir: string, item: Record<string, unknown>, campos: Record<string, unknown>): Promise<void>
export declare function registrarTelemetriaTentativa(runDir: string, tentativa: Record<string, unknown>): Promise<void>
export declare function validarCachesRetomada(workDir: string, options?: { minExtracao?: number; minPassagens?: number }): Promise<{ extracoes: number; passagens: number }>

export declare function consolidarBatch(params: { runDir: string; norteOndasDir?: string }): Promise<{
  copiados: string[]
  ondasDir: string
}>

export declare function planoDoBatch(params: {
  runDir: string
  inventoryPath: string
  workDir?: string
  archiveDir?: string
}): Promise<Array<Record<string, unknown>>>
