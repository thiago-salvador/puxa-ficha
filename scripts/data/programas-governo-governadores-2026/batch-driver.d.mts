export declare const REGIOES: Record<string, string[]>
export declare const UFS_NORTE: string[]
export declare const UFS_RESTANTES: string[]
export declare const LIMITE_CONCORRENCIA: number
export declare const LIMITE_SLOTS_GERADOR: number
export declare const MAX_MULTIPASSAGEM_SIMULTANEOS: number
export declare const MAX_TENTATIVAS_CANDIDATO: number
export declare const PASSAGENS_CONCORRENCIA_INTERNA: number
export declare const DISPAROS_RAMPA: { para4: number; para6: number; fimRampa: number }
export declare const THROUGHPUT_NORTE_CAND_H: number

export declare function eErroCota(texto: unknown): boolean
export declare function regiaoDaUf(uf: string): string | null
export declare function slotsDeItem(item: { multipassagem: boolean; passagensPlanejadas?: number }): number
export declare function classificarRegistro(registro: unknown): { estado: "complete" | "blocked" | "retryable_error"; motivo: string }
export declare function escaladaPermitida(metricas: {
  errosCota: number
  tentativas: number
  errosTecnicos: number
  latenciaP95Ultimos?: number
  latenciaP95Base?: number
} | null | undefined): boolean

export declare function definirProbeRecursos(fn: () => boolean): void
export declare function concorrenciaAlvo(params: {
  disparos: number
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
}

export declare function executarBatch(params: ExecutarBatchParams): Promise<{
  parada: string | null
  total: number
  concluidos: number
  bloqueados: number
  tentativas: number
  errosTecnicos: number
  errosCota: number
  concorrenciaFinal: number
}>

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
