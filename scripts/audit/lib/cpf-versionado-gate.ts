/**
 * Gate de CPF em arquivo versionado.
 *
 * O repositório é público. CPF de pessoa real que entra num arquivo rastreado
 * (evidência de QA, fixture, comentário, migration) fica legível por qualquer
 * um, e continua no histórico mesmo depois de apagado. Este gate varre todo
 * arquivo de texto rastreado pelo git e reprova sequência de 11 dígitos, crua
 * ou formatada (000.000.000-00), que:
 *
 * 1. tem dígito verificador de CPF válido; e
 * 2. aparece em contexto explícito de CPF: rótulo `cpf` (qualquer caixa, como
 *    em `"cpf":`, `nr_cpf`, `cpfCnpj=`, `CPF:`) na mesma linha, logo antes ou
 *    logo depois do número, ou o bloco `NOME:CPF` de assinatura digital
 *    ICP-Brasil que o `pdftotext` extrai de PDF assinado.
 *
 * Número de 11 dígitos sem rótulo (SQ do TSE com 11 dígitos, id de votação,
 * pedaço de hash) não reprova: o dígito verificador sozinho fecha por acaso em
 * cerca de 1 a cada 100 números, e o gate que acusa ruído vira gate desligado.
 *
 * Valor sintético de teste precisa estar na lista abaixo ou na faixa reservada
 * de fixtures. O gate nunca imprime o número acusado, só arquivo e linha: log
 * de CI também é público.
 */

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { cpfEhValido } from "../../lib/cpf"

/** Marcador que substitui CPF removido de arquivo versionado. */
export const MARCADOR_CPF_REMOVIDO = "[CPF removido]"

/**
 * Valores sintéticos aceitos em arquivo versionado, cada um com o motivo.
 * Entrada nova precisa ser valor de exemplo público ou construído à mão, nunca
 * CPF tirado de fonte oficial.
 */
export const CPFS_SINTETICOS_PERMITIDOS: ReadonlyMap<string, string> = new Map([
  ["52998224725", "exemplo público de gerador de CPF, usado como fixture"],
  ["11144477735", "exemplo público de gerador de CPF, usado como fixture"],
  ["39053344705", "exemplo público de gerador de CPF, usado como fixture"],
  ["12345678909", "sequência 123456789 com o DV que fecha"],
  ["98765432100", "sequência 987654321 com o DV que fecha"],
  ["01234567890", "sequência 012345678 com o DV que fecha (teste de zero comido)"],
  ["00000000191", "CPF de teste 000.000.001-91 usado na documentação da Receita"],
  ["00000001082", "valor curto completado com zeros (teste do piso de 9 dígitos)"],
  ["00123456797", "forma sintética do caso de dois zeros comidos pelo TSE"],
  ["00012345601", "forma sintética do caso de três zeros comidos pelo TSE"],
  ["00345678958", "sequência 345678 com zeros à esquerda (teste de normalização)"],
  ["11122233396", "sequência 111222333 com o DV que fecha"],
])

/**
 * Faixa reservada para fixtures que precisam de muitos CPFs distintos e
 * válidos: 000.000.100-XX a 000.000.199-XX. Números tão baixos são de teste
 * por construção, e a faixa é estreita para não esconder CPF real.
 */
export function cpfNaFaixaDeFixture(cpf: string): boolean {
  return /^000000[1]\d{4}$/.test(cpf)
}

export function cpfEhSinteticoPermitido(cpf: string): boolean {
  return CPFS_SINTETICOS_PERMITIDOS.has(cpf) || cpfNaFaixaDeFixture(cpf)
}

export type ContextoCpf = "rotulo" | "assinatura_digital"

export interface AchadoCpf {
  arquivo: string
  linha: number
  coluna: number
  contexto: ContextoCpf
}

// Bordas alfanuméricas: dígitos dentro de hash hexadecimal ou de id maior
// não são CPF. Ponto, hífen e barra seguidos de dígito também fecham a borda,
// para que CNPJ formatado e data não sejam cortados em pedaços de 11 dígitos.
const CANDIDATO_RE = /(?<![0-9A-Za-z.\-/])(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?![0-9A-Za-z]|[.\-/]\d)/g
const ROTULO_RE = /cpf/i
// Chave de SQ do TSE colada ao número vence o rótulo `cpf` da vizinhança: em
// `"sq":"...","method":"cpf"` o número é o SQ, e `cpf` descreve o método.
const CHAVE_SQ_ANTES_RE = /\b(?:sq|sq_\w+|\w*_sq|sqCandidato|sequencial\w*)["']?\s*[:=]\s*["']?$/i
const JANELA_ANTES = 60
const JANELA_DEPOIS = 25
const ASSINATURA_RE = /(?:assinad[oa]|forma digital|certificado digital|icp-brasil)/i
const JANELA_ASSINATURA = 160

function contextoDoCandidato(texto: string, inicio: number, fim: number): ContextoCpf | null {
  const inicioDaLinha = texto.lastIndexOf("\n", inicio - 1) + 1
  const fimDaLinha = texto.indexOf("\n", fim)
  const antes = texto.slice(Math.max(inicioDaLinha, inicio - JANELA_ANTES), inicio)
  const depois = texto.slice(fim, Math.min(fimDaLinha === -1 ? texto.length : fimDaLinha, fim + JANELA_DEPOIS))
  if (CHAVE_SQ_ANTES_RE.test(antes)) return null
  if (ROTULO_RE.test(antes) || ROTULO_RE.test(depois)) return "rotulo"
  // Certificado ICP-Brasil: o nome do titular vem colado ao CPF por dois-pontos.
  if (texto[inicio - 1] === ":" && ASSINATURA_RE.test(texto.slice(Math.max(0, inicio - JANELA_ASSINATURA), inicio))) {
    return "assinatura_digital"
  }
  return null
}

/** Varre um texto e devolve os CPFs válidos em contexto explícito, sem o valor. */
export function varrerTextoPorCpf(texto: string, arquivo: string): AchadoCpf[] {
  const achados: AchadoCpf[] = []
  for (const match of texto.matchAll(CANDIDATO_RE)) {
    const bruto = match[1]!
    const cpf = bruto.replace(/\D/g, "")
    if (!cpfEhValido(cpf) || cpfEhSinteticoPermitido(cpf)) continue
    const inicio = match.index!
    const contexto = contextoDoCandidato(texto, inicio, inicio + bruto.length)
    if (!contexto) continue
    const antes = texto.slice(0, inicio)
    const linha = antes.split("\n").length
    const coluna = inicio - antes.lastIndexOf("\n")
    achados.push({ arquivo, linha, coluna, contexto })
  }
  return achados
}

/**
 * Arquivo que não pode ser reescrito e por isso carrega CPF de propósito, com
 * o número exato de ocorrências. Migration já aplicada em produção entra aqui
 * quando o CPF está em SQL executável: trocar o literal mudaria o que um
 * replay ou uma reconstrução do banco grava, e o arquivo deixaria de bater com
 * o digest registrado no ledger da aplicação. A exposição fica no arquivo e no
 * histórico até decisão sobre reescrita de histórico. Contagem diferente da
 * declarada reprova nos dois sentidos: CPF novo no arquivo, ou exceção que já
 * não descreve o repositório.
 */
export interface ExcecaoCpfVersionado {
  arquivo: string
  ocorrencias: number
  motivo: string
}

export const EXCECOES_CPF_VERSIONADO: readonly ExcecaoCpfVersionado[] = [
  {
    arquivo: "supabase/migrations/20260918120000_issue_378_superficie_marcador_e_trajetoria.sql",
    ocorrencias: 5,
    motivo:
      "migration aplicada em produção: dois CPFs no literal `motivo_trajetoria`, gravado por UPDATE em " +
      "mudancas_partido.despublicacao_motivo (linhas despublicadas, fora da leitura anon pela política " +
      "publicacao_sem_despublicados), e os mesmos dois em três linhas de comentário. Mantida byte a byte.",
  },
]

export interface ExcecaoConferida extends ExcecaoCpfVersionado {
  encontradas: number
}

export interface ResultadoCpfVersionado {
  /** CPF fora de exceção declarada. É o que reprova. */
  achados: AchadoCpf[]
  /** Exceções declaradas com a contagem encontrada; divergência reprova. */
  excecoes: ExcecaoConferida[]
  arquivosLidos: number
  binariosIgnorados: number
}

/** Separa achados cobertos por exceção declarada e confere a contagem de cada uma. */
export function aplicarExcecoes(
  achados: readonly AchadoCpf[],
  excecoes: readonly ExcecaoCpfVersionado[] = EXCECOES_CPF_VERSIONADO,
): { achados: AchadoCpf[]; excecoes: ExcecaoConferida[] } {
  const porArquivo = new Map(excecoes.map((excecao) => [excecao.arquivo, excecao]))
  const restantes = achados.filter((achado) => !porArquivo.has(achado.arquivo))
  const conferidas = excecoes.map((excecao) => ({
    ...excecao,
    encontradas: achados.filter((achado) => achado.arquivo === excecao.arquivo).length,
  }))
  return { achados: restantes, excecoes: conferidas }
}

export function excecoesDivergentes(excecoes: readonly ExcecaoConferida[]): ExcecaoConferida[] {
  return excecoes.filter((excecao) => excecao.encontradas !== excecao.ocorrencias)
}

function arquivosRastreados(raiz: string): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: raiz, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
}

/** Varre todo arquivo de texto rastreado pelo git a partir de `raiz`. */
export function auditarCpfVersionado(raiz: string): ResultadoCpfVersionado {
  const achados: AchadoCpf[] = []
  let arquivosLidos = 0
  let binariosIgnorados = 0
  for (const arquivo of arquivosRastreados(raiz)) {
    let conteudo: Buffer
    try {
      conteudo = readFileSync(join(raiz, arquivo))
    } catch {
      continue // removido na árvore de trabalho, ou submódulo
    }
    if (conteudo.subarray(0, 8192).includes(0)) {
      binariosIgnorados += 1
      continue
    }
    arquivosLidos += 1
    achados.push(...varrerTextoPorCpf(conteudo.toString("utf8"), arquivo))
  }
  return { ...aplicarExcecoes(achados), arquivosLidos, binariosIgnorados }
}
