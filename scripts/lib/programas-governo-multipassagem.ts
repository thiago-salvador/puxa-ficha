import { createHash } from "node:crypto"

import {
  construirPromptFinal,
  medirPromptFinalBytes,
} from "./programas-governo-prompt.mjs"

export { construirPromptFinal }

export type ProgramaGovernoPaginaEntrada = {
  pagina: number
  origem: string
  texto: string
}

export type ProgramaGovernoDocumentoEntradaMultipassagem = {
  documentoId: string
  paginas: ProgramaGovernoPaginaEntrada[]
}

export type ProgramaGovernoPassagemPlano = {
  indice: number
  documentos: Array<{ documentoId: string; paginas: ProgramaGovernoPaginaEntrada[] }>
  bytes: number
}

export type ProgramaGovernoEvidenciaMultipassagem = {
  documentoId: string
  pagina: number
  trecho: string
}

export type ProgramaGovernoFato = {
  id: string
  texto: string
  evidencias: ProgramaGovernoEvidenciaMultipassagem[]
}

export type ProgramaGovernoMultiPassagemResultado = {
  passagens: ProgramaGovernoPassagemPlano[]
  fatosSelecionados: ProgramaGovernoFato[]
  fingerprint: string
}

export const PROGRAMA_GOVERNO_MULTIPASSAGEM_LIMITE_PADRAO_BYTES = 180_000

export type ProgramaGovernoPlanejamentoPromptOptions = {
  limiteBytes: number
  instructions: string
  schema: unknown
  criarInput: (documentos: ProgramaGovernoDocumentoEntradaMultipassagem[]) => unknown
}

function bytesTexto(value: string): number {
  return Buffer.byteLength(value, "utf8")
}

export function planejarProgramaGovernoPassagens(
  documentos: readonly ProgramaGovernoDocumentoEntradaMultipassagem[],
  limiteOuOptions: number | ProgramaGovernoPlanejamentoPromptOptions = PROGRAMA_GOVERNO_MULTIPASSAGEM_LIMITE_PADRAO_BYTES,
): ProgramaGovernoPassagemPlano[] {
  const limiteBytes = typeof limiteOuOptions === "number" ? limiteOuOptions : limiteOuOptions.limiteBytes
  if (!Number.isSafeInteger(limiteBytes) || limiteBytes < 200) {
    throw new Error("multipassagem: limite de bytes invalido")
  }
  const vistos = new Set<string>()
  const planos: ProgramaGovernoPassagemPlano[] = []
  let atual: ProgramaGovernoDocumentoEntradaMultipassagem[] = []

  const medir = (docs: ProgramaGovernoDocumentoEntradaMultipassagem[]): number => {
    if (typeof limiteOuOptions === "number") {
      return docs.reduce((total, doc) => total + doc.paginas.reduce((soma, pagina) => soma + bytesTexto(pagina.texto), 0), 0)
    }
    return medirPromptFinalBytes(
      limiteOuOptions.instructions,
      limiteOuOptions.schema,
      limiteOuOptions.criarInput(docs),
    )
  }
  const cabe = (docs: ProgramaGovernoDocumentoEntradaMultipassagem[]): boolean => {
    const bytes = medir(docs)
    return typeof limiteOuOptions === "number" ? bytes <= limiteBytes : bytes < limiteBytes
  }
  const comPagina = (
    docs: ProgramaGovernoDocumentoEntradaMultipassagem[],
    documentoId: string,
    pagina: ProgramaGovernoPaginaEntrada,
  ): ProgramaGovernoDocumentoEntradaMultipassagem[] => {
    const copia = docs.map((doc) => ({ documentoId: doc.documentoId, paginas: [...doc.paginas] }))
    let alvo = copia.find((doc) => doc.documentoId === documentoId)
    if (!alvo) {
      alvo = { documentoId, paginas: [] }
      copia.push(alvo)
    }
    alvo.paginas.push(pagina)
    return copia
  }
  const fechar = () => {
    if (atual.length === 0) return
    const bytes = medir(atual)
    planos.push({ indice: planos.length, documentos: atual, bytes })
    atual = []
  }
  const maiorPrefixoQueCabe = (
    documentoId: string,
    pagina: ProgramaGovernoPaginaEntrada,
    texto: string,
  ): string => {
    const pontos = Array.from(texto)
    let minimo = 1
    let maximo = pontos.length
    let melhor = 0
    while (minimo <= maximo) {
      const meio = Math.floor((minimo + maximo) / 2)
      const trecho = pontos.slice(0, meio).join("")
      if (cabe(comPagina([], documentoId, { ...pagina, texto: trecho }))) {
        melhor = meio
        minimo = meio + 1
      } else {
        maximo = meio - 1
      }
    }
    if (melhor === 0) {
      throw new Error(`multipassagem: metadados do prompt excedem limite sem texto em ${documentoId} pagina ${pagina.pagina}`)
    }
    return pontos.slice(0, melhor).join("")
  }

  for (const documento of documentos) {
    if (vistos.has(documento.documentoId)) throw new Error(`multipassagem: documento duplicado ${documento.documentoId}`)
    vistos.add(documento.documentoId)
    if (!documento.paginas.length) throw new Error(`multipassagem: ${documento.documentoId} sem paginas`)
    for (const [index, pagina] of documento.paginas.entries()) {
      if (pagina.pagina !== index + 1) throw new Error(`multipassagem: ${documento.documentoId} fora de sequencia`)
      let restante = pagina.texto
      if (restante.length === 0) {
        const candidata = comPagina(atual, documento.documentoId, pagina)
        if (!cabe(candidata)) fechar()
        atual = comPagina(atual, documento.documentoId, pagina)
        continue
      }
      while (restante.length > 0) {
        const paginaRestante = { ...pagina, texto: restante }
        const candidata = comPagina(atual, documento.documentoId, paginaRestante)
        if (cabe(candidata)) {
          atual = candidata
          restante = ""
          continue
        }
        if (atual.length > 0) {
          fechar()
          continue
        }
        const trecho = maiorPrefixoQueCabe(documento.documentoId, pagina, restante)
        atual = comPagina([], documento.documentoId, { ...pagina, texto: trecho })
        restante = restante.slice(trecho.length)
        fechar()
      }
    }
  }
  fechar()
  return planos
}

export function medirEnvelopeBytes(instructions: string, schema: unknown, input: unknown): number {
  return medirPromptFinalBytes(instructions, schema, input)
}

export function envelopeExcedeLimite(instructions: string, schema: unknown, input: unknown, limite = 190_000): boolean {
  return medirEnvelopeBytes(instructions, schema, input) >= limite
}

export function calcularFingerprintProgramaGovernoPassagens(
  passagens: readonly ProgramaGovernoPassagemPlano[],
  metadados: { name?: string; version?: string; promptVersion?: string } = {},
): string {
  return createHash("sha256").update(JSON.stringify({
    ...(metadados.name ? { name: metadados.name } : {}),
    ...(metadados.version ? { version: metadados.version } : {}),
    ...(metadados.promptVersion ? { promptVersion: metadados.promptVersion } : {}),
    passagens: passagens.map((plano) => ({
      indice: plano.indice,
      bytes: plano.bytes,
      documentos: plano.documentos.map((doc) => ({
        documentoId: doc.documentoId,
        paginas: doc.paginas.map((pagina) => pagina.pagina),
        textoSha256: createHash("sha256").update(doc.paginas.map((p) => p.texto).join("\n\f\n")).digest("hex"),
      })),
    })),
  })).digest("hex")
}

export function normalizarTokensFato(value: string): Set<string> {
  return new Set(
    value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR")
      .match(/[a-z0-9]+/gu) ?? [],
  )
}

const PROGRAMA_GOVERNO_FATO_MAX_POR_PASSAGEM = 12

export function coletarFatosProgramaGovernoPassagens(
  porPassagem: ReadonlyMap<number, ProgramaGovernoFato[]>,
  passagens: readonly ProgramaGovernoPassagemPlano[],
): ProgramaGovernoFato[] {
  const selecionados: ProgramaGovernoFato[] = []
  const chavesVistas = new Set<string>()
  for (const plano of passagens) {
    const fatos = porPassagem.get(plano.indice) ?? []
    let aceitos = 0
    for (const [index, fato] of [...fatos].entries()) {
      if (!fato?.texto?.trim() || !Array.isArray(fato.evidencias) || fato.evidencias.length === 0) continue
      if (aceitos >= PROGRAMA_GOVERNO_FATO_MAX_POR_PASSAGEM) break
      const chave = [
        fato.evidencias[0].documentoId,
        String(fato.evidencias[0].pagina),
        [...normalizarTokensFato(fato.texto)].slice(0, 24).sort().join("-"),
      ].join(":")
      if (chavesVistas.has(chave)) continue
      chavesVistas.add(chave)
      selecionados.push({ ...fato, id: `${fato.id ?? "fato"}-${plano.indice + 1}-${index + 1}` })
      aceitos += 1
    }
  }
  return selecionados
}

function normalizarEspacos(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR")
}

export function filtrarFatosLiterais(
  fatos: readonly ProgramaGovernoFato[],
  documentos: readonly ProgramaGovernoDocumentoEntradaMultipassagem[],
): ProgramaGovernoFato[] {
  const paginas = new Map<string, Map<number, string>>()
  for (const documento of documentos) {
    const mapaPaginas = new Map<number, string>()
    for (const pagina of documento.paginas) mapaPaginas.set(pagina.pagina, pagina.texto)
    paginas.set(documento.documentoId, mapaPaginas)
  }
  return fatos.filter((fato) => {
    if (!fato?.texto?.trim() || !Array.isArray(fato.evidencias) || fato.evidencias.length === 0) return false
    return fato.evidencias.every((evidencia) => {
      if (!evidencia?.documentoId || !Number.isInteger(evidencia.pagina)) return false
      if (!typeofString(evidencia.trecho)) return false
      const texto = paginas.get(evidencia.documentoId)?.get(evidencia.pagina)
      if (!texto) return false
      return normalizarEspacos(texto).includes(normalizarEspacos(evidencia.trecho))
    })
  })
}

function typeofString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

function referenciaFatoIds(item: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(item.fatos)) return item.fatos
  if (Array.isArray(item.fatoIds)) return item.fatoIds
  return null
}

function referenciaId(referencia: unknown): string {
  if (typeof referencia === "string") return referencia
  if (referencia && typeof referencia === "object") return String((referencia as { id?: unknown }).id ?? "")
  return String(referencia ?? "")
}

export function substituirEvidenciasFato(resumo: unknown, fatos: readonly ProgramaGovernoFato[]): Record<string, unknown> {
  const fatosPorId = new Map(fatos.map((fato) => [fato.id, fato]))
  const value = resumo as Record<string, unknown>
  const resolver = (item: unknown): ProgramaGovernoEvidenciaMultipassagem[] => {
    const raw = item as Record<string, unknown>
    const referencias = referenciaFatoIds(raw)
    if (!referencias || referencias.length === 0) {
      throw new Error(`multipassagem: item sem fatoId ou fato (${JSON.stringify(Object.keys(raw))})`)
    }
    const todas = referencias.flatMap((referencia) => {
      const id = referenciaId(referencia)
      const fato = fatosPorId.get(id)
      if (!fato || !Array.isArray(fato.evidencias) || fato.evidencias.length === 0) {
        throw new Error(`multipassagem: fato desconhecido ou sem evidencias ${id}`)
      }
      return fato.evidencias.map((evidencia) => ({ ...evidencia }))
    })
    if (todas.length === 0) throw new Error("multipassagem: item sem evidencias resolvidas")
    return todas
  }
  return {
    ...value,
    frases: (value.frases as unknown[]).map((itemFrase) => {
      const frase = itemFrase as Record<string, unknown>
      const resolved = resolver(frase)
      if (typeof frase.texto !== "string") throw new Error("multipassagem: frase sem texto")
      return { texto: frase.texto, evidencias: resolved }
    }),
    temas: (value.temas as unknown[]).map((itemTema) => {
      const tema = itemTema as Record<string, unknown>
      const resolved = resolver(tema)
      if (
        typeof tema.id !== "string"
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(tema.id)
        || typeof tema.titulo !== "string"
        || typeof tema.descricao !== "string"
      ) {
        throw new Error(`multipassagem: tema invalido ${JSON.stringify(String(tema.id ?? ""))}`)
      }
      return { id: tema.id, titulo: tema.titulo, descricao: tema.descricao, evidencias: resolved }
    }),
  }
}

export function validarResultadoProgramaGovernoMultipassagem(resumo: unknown, fatos: readonly ProgramaGovernoFato[]): void {
  if (!resumo || typeof resumo !== "object" || Array.isArray(resumo)) throw new Error("multipassagem: resumo invalido")
  const value = resumo as Record<string, unknown>
  const frases = value.frases
  const temas = value.temas
  if (!Array.isArray(frases) || !Array.isArray(temas)) throw new Error("multipassagem: frases/temas ausentes")
  const fatosPorId = new Map(fatos.map((fato) => [fato.id, fato]))
  const cobertura = new Set<string>()
  const verificarEvidencia = (item: unknown, caminho: string) => {
    if (!item || typeof item !== "object") throw new Error(`multipassagem: ${caminho} invalido`)
    const raw = item as Record<string, unknown>
    const referencias = referenciaFatoIds(raw)
    if (!referencias || referencias.length === 0) {
      throw new Error(`multipassagem: ${caminho} sem fatoId ou fato`)
    }
    for (const referencia of referencias) {
      const id = referenciaId(referencia)
      const fato = fatosPorId.get(id)
      if (!fato) throw new Error(`multipassagem: ${caminho} referencia fato desconhecido ${id}`)
      cobertura.add(fato.id)
    }
  }
  for (const frase of frases as unknown[]) verificarEvidencia(frase, "frases[]")
  for (const tema of temas as unknown[]) verificarEvidencia(tema, "temas[]")
  if (cobertura.size === 0) throw new Error("multipassagem: nenhum fato referenciado")
}
