/**
 * Formata `nome_urna` publicado em CAIXA ALTA pelo TSE para exibição em
 * title case, sem tocar no dado armazenado (o formatter é aplicado só na
 * borda de leitura, nunca grava de volta no banco).
 *
 * Medido em produção (2026-09-24): 292 páginas públicas de candidatos
 * `tse-2026-*` exibem `nome_urna` em CAIXA ALTA como o TSE publica
 * ("AÉCIO NEVES", "CARLOS CLEY"), enquanto páginas curadas já têm o nome em
 * caixa normal ("ACM Neto", "Fabio Trad", "JHC"). Levantamento via SQL
 * read-only no Supabase (projeto wskpzsobvqwhnbsdsmok) sobre os 292 nomes
 * confirmou: nenhum tem hífen, apóstrofo ou numeral romano; os únicos
 * tokens recorrentes que parecem sigla (MLB, JHC) não têm vogal e já caem
 * na regra "token sem vogal fica maiúsculo". A lista de siglas abaixo cobre
 * esses casos e outras siglas partidárias/de movimento com vogal que podem
 * aparecer (PSOL, ACM), mesmo que não estejam na amostra atual.
 *
 * Regra geral: só reformata quando a palavra INTEIRA não tem nenhuma letra
 * minúscula (nome misto, ex. "ACM Neto", fica intocado). Isso evita mexer
 * em nomes que já vieram curados em caixa normal.
 *
 * Refinamentos (2026-09-24, revisão pós-aceite):
 * 1. Título colado ao nome com ponto ganha espaço: "DR.HILTON" -> "Dr. Hilton".
 * 2. Artigo de uma letra "o"/"a" fica minúsculo quando NÃO é a primeira nem a
 *    última palavra (ex. "JÚLIO CÉSAR O JULIM DO LULA" -> "...o Julim...").
 *    Levantamento read-only confirmou um único caso real desse padrão na base
 *    (o próprio "JÚLIO CÉSAR O JULIM DO LULA"; o "O" ali é o artigo do apelido
 *    "Julim", não uma inicial) e nenhum caso de inicial do meio ("A" solto)
 *    que essa regra atropelaria.
 * 3. "D" isolado seguido de token iniciado por vogal (acentuada inclusive)
 *    vira "D'": "MANUELA D ÁVILA" -> "Manuela D'Ávila". Levantamento
 *    read-only achou um único caso real ("MANUELA D ÁVILA") e nenhum outro
 *    "D" solto seguido de vogal que essa regra atropelaria.
 */

/** Siglas de partido/movimento e outras que devem permanecer maiúsculas mesmo tendo vogal. */
const UPPERCASE_ACRONYMS = new Set(["MLB", "PT", "PSOL", "MST", "ACM", "JHC"])

/** Preposições e partículas que ficam minúsculas quando não são a primeira palavra. */
const LOWERCASE_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e", "di", "du", "del"])

/** Artigo de uma letra que só fica minúsculo no MEIO do nome (nunca primeira nem última palavra). */
const MID_NAME_ARTICLES = new Set(["o", "a"])

const VOWEL_START_RE = /^[AEIOUÀ-ÖØ-Ý]/i

/** Sufixos de geração: forma CAIXA ALTA -> forma exibida. */
const GENERATION_SUFFIXES: Record<string, string> = {
  JR: "Jr",
  "JR.": "Jr.",
  JUNIOR: "Junior",
  FILHO: "Filho",
  NETO: "Neto",
  SOBRINHO: "Sobrinho",
}

/** Tratamentos/títulos: forma CAIXA ALTA (sem ponto) -> forma exibida (sem ponto; o ponto original é preservado à parte). */
const TITLE_PREFIXES: Record<string, string> = {
  DR: "Dr",
  DRA: "Dra",
  PROF: "Prof",
  PROFESSOR: "Professor",
  PROFESSORA: "Professora",
  CAPITÃO: "Capitão",
  CAPITAO: "Capitão",
  DELEGADO: "Delegado",
  PASTOR: "Pastor",
}

const ROMAN_NUMERAL_RE = /^[IVXLCDM]+$/

function hasLowerCase(value: string): boolean {
  return value.toLocaleLowerCase("pt-BR") !== value && /\p{Ll}/u.test(value)
}

function hasVowel(value: string): boolean {
  return /[AEIOUÀ-ÖØ-Ý]/i.test(value)
}

function titleCaseWord(word: string): string {
  if (!word) return word
  const chars = Array.from(word)
  const first = chars[0].toLocaleUpperCase("pt-BR")
  const rest = chars.slice(1).join("").toLocaleLowerCase("pt-BR")
  return first + rest
}

/**
 * Formata um único token (já separado por espaço). Pode conter hífen ou
 * apóstrofo internos (ex. "SANTA-RITA", "D'ÁVILA"), tratados subtoken a
 * subtoken preservando o separador original.
 *
 * `isLastWord` só importa para a regra do artigo "o"/"a" no meio do nome.
 */
function formatToken(token: string, isFirstWord: boolean, isLastWord: boolean): string {
  if (!token) return token

  // Hífen ou apóstrofo: formatar cada pedaço e recompor com o separador original.
  const splitMatch = token.match(/^([^-']+)([-'])(.+)$/)
  if (splitMatch) {
    const [, head, sep, tail] = splitMatch
    return `${formatToken(head, isFirstWord, isLastWord)}${sep}${formatToken(tail, false, isLastWord)}`
  }

  // Título colado ao nome sem espaço (ex. "DR.HILTON" -> "Dr. Hilton"): separa
  // com espaço em vez de manter o ponto grudado. Visto em produção 2026-09-24.
  const titleDotMatch = token.match(/^(DR|DRA|PROF|PROFESSOR|PROFESSORA)\.(.+)$/i)
  if (titleDotMatch) {
    const [, title, rest] = titleDotMatch
    const upperTitle = title.toLocaleUpperCase("pt-BR")
    return `${TITLE_PREFIXES[upperTitle] ?? titleCaseWord(title)}. ${formatToken(rest, false, isLastWord)}`
  }

  const bare = token.replace(/\.$/, "")
  const hadDot = token.endsWith(".") && bare.length > 0
  const upperBare = bare.toLocaleUpperCase("pt-BR")

  if (ROMAN_NUMERAL_RE.test(bare) && bare.length > 1) {
    return bare.toLocaleUpperCase("pt-BR") + (hadDot ? "." : "")
  }
  if (UPPERCASE_ACRONYMS.has(upperBare)) {
    return upperBare + (hadDot ? "." : "")
  }
  if (upperBare in GENERATION_SUFFIXES) {
    return GENERATION_SUFFIXES[upperBare] + (hadDot ? "." : "")
  }
  if (upperBare in TITLE_PREFIXES) {
    return TITLE_PREFIXES[upperBare] + (hadDot ? "." : "")
  }
  if (!isFirstWord && LOWERCASE_PARTICLES.has(bare.toLocaleLowerCase("pt-BR"))) {
    return bare.toLocaleLowerCase("pt-BR") + (hadDot ? "." : "")
  }
  // Artigo de uma letra ("o"/"a") só some em caixa alta no MEIO do nome
  // (ex. "...O Julim..." -> "...o Julim..."); na ponta é iniciativa comum
  // demais para arriscar (poderia ser inicial de nome/sobrenome).
  if (!isFirstWord && !isLastWord && MID_NAME_ARTICLES.has(bare.toLocaleLowerCase("pt-BR"))) {
    return bare.toLocaleLowerCase("pt-BR") + (hadDot ? "." : "")
  }
  // Token sem vogal (siglas curtas não catalogadas, ex. iniciais isoladas):
  // mantido maiúsculo em vez de virar uma "palavra" title-case sem sentido.
  if (bare.length > 1 && !hasVowel(bare)) {
    return upperBare + (hadDot ? "." : "")
  }

  return titleCaseWord(bare) + (hadDot ? "." : "")
}

/**
 * Formata um nome publicado pelo TSE em CAIXA ALTA para exibição em title
 * case. Nomes com QUALQUER letra minúscula (já curados) são retornados
 * intocados — a função só age quando o nome inteiro está em caixa alta.
 */
export function formatDisplayName(raw: string | null | undefined): string {
  if (raw == null) return ""
  if (!raw.trim()) return raw
  if (hasLowerCase(raw)) return raw

  // Pedaços alternando palavra/espaço, preservando o espaçamento original.
  const pieces = raw.split(/(\s+)/)
  const wordIndices: number[] = []
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i] !== "" && !/^\s+$/.test(pieces[i])) wordIndices.push(i)
  }
  const totalWords = wordIndices.length

  const output = [...pieces]
  let skipWordPos = -1 // posição (em wordIndices) já consumida por uma fusão "D'"

  for (let pos = 0; pos < totalWords; pos++) {
    if (pos === skipWordPos) continue

    const idx = wordIndices[pos]
    const token = pieces[idx]
    const isFirstWord = pos === 0
    const isLastWord = pos === totalWords - 1

    // "D" isolado seguido de token iniciado por vogal -> funde em "D'Vogal...",
    // removendo o espaço entre os dois (ex. "MANUELA D ÁVILA" -> "Manuela D'Ávila").
    if (!isLastWord && /^D\.?$/i.test(token)) {
      const nextPos = pos + 1
      const nextIdx = wordIndices[nextPos]
      const nextToken = pieces[nextIdx]
      if (VOWEL_START_RE.test(nextToken)) {
        const nextIsLast = nextPos === totalWords - 1
        const formattedNext = formatToken(nextToken, false, nextIsLast)
        output[idx] = `${titleCaseWord(token.replace(/\.$/, ""))}'${formattedNext}`
        for (let k = idx + 1; k <= nextIdx; k++) output[k] = ""
        skipWordPos = nextPos
        continue
      }
    }

    output[idx] = formatToken(token, isFirstWord, isLastWord)
  }

  return output.join("")
}
