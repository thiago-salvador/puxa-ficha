/**
 * Verificacao pos-fetch de que a noticia devolvida pelo Google News realmente
 * cita o candidato a quem ela vai ser associada.
 *
 * Motivo (auditoria de integridade 2026-07-24, etapa 1C): a associacao
 * noticia-candidato era 100% delegada ao ranking de busca do Google. O
 * pipeline montava a query com o nome entre aspas, pegava os 20 primeiros
 * itens e gravava, sem nunca comparar o titulo devolvido com o nome do
 * candidato. Resultado medido em 17.498 linhas de `noticias_candidato`:
 * 3.984 (22,77%) sem nenhum token do nome de urna no titulo, com candidatos
 * inteiros entre 82% e 97% de ruido (maria-da-consolacao 97,3%,
 * enilton-rodrigues 87,7%, caiubi-kuhn 86,9%, cintia-dias 82,9%).
 *
 * O criterio aqui e deliberadamente FROUXO, na direcao segura: so reprova
 * quando o titulo nao traz NENHUMA variacao do nome. Um sobrenome comum que
 * aparece por acaso continua passando. Preferimos manter uma noticia duvidosa
 * a jogar fora cobertura legitima.
 *
 * O caso "JHC" (Joao Henrique Caldas, governador de AL) e tratado
 * explicitamente: o corte de 4 letras usado na auditoria marcava 117 de 117
 * noticias dele como sem match, o que era artefato do corte, nao erro de
 * dado. Sigla curta e casada como palavra inteira.
 *
 * Modulo puro: sem import de next/*, server-only, fs, rede ou Supabase, para
 * rodar identico no script tsx (`scripts/lib/ingest-google-news.ts`) e dentro
 * da function da Vercel (`src/lib/news/refresh.ts`).
 */

/** Conectivos de nome proprio em pt-BR: nunca contam como mencao. */
const PARTICULAS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "di",
  "del",
  "della",
  "van",
  "von",
  "la",
  "le",
])

/** Comprimento minimo para um token de nome contar sozinho como mencao. */
const TOKEN_DISTINTIVO_MIN = 4

/** Comprimento maximo de um nome de urna sem espaco tratado como sigla/apelido curto (JHC, Zema, Lula). */
const SIGLA_CURTA_MAX = 5

function normalizeNewsText(value: string | null | undefined): string {
  if (!value) return ""
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokenize(value: string): string[] {
  const normalized = normalizeNewsText(value)
  if (!normalized) return []
  return normalized.split(" ").filter(Boolean)
}

/** Casa `needle` como sequencia de palavras inteiras dentro de `haystack`, ambos ja normalizados. */
function containsWholeWords(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false
  return ` ${haystack} `.includes(` ${needle} `)
}


export interface CandidateNameInput {
  nome_urna?: string | null
  nome_completo?: string | null
  /** Apelidos extras conhecidos (curadoria). Opcional. */
  apelidos?: readonly (string | null | undefined)[] | null
}

/**
 * `true` quando o titulo traz alguma variacao do nome do candidato.
 *
 * Ordem das regras, da mais forte para a mais fraca:
 *  1. nome de urna inteiro como sequencia de palavras;
 *  2. nome completo inteiro como sequencia de palavras;
 *  3. qualquer apelido curado inteiro;
 *  4. sigla ou apelido curto (nome de urna sem espaco, ate 5 letras) como palavra inteira;
 *  5. token distintivo (>= 4 letras, fora das particulas) do NOME DE URNA, como
 *     palavra inteira;
 *  6. dois ou mais tokens distintivos que so existem no nome completo. Um
 *     sozinho nao basta: ver o guarda de sobrenome compartilhado abaixo.
 *
 * O QUE FOI TENTADO E REPROVADO NA MEDICAO (05/08/2026), para nao se repetir:
 * um segundo guarda que olhava a caixa alta do titulo original e reprovava o
 * token casado quando ele vinha grudado em palavra capitalizada fora do nome
 * ("Gustavo Canuto", "Vera Castelo Branco"). Contra as 20.047 linhas de
 * `noticias_candidato` ele derrubava 177 linhas, contra 30 do guarda que ficou,
 * e as 147 a mais eram cobertura legitima: sufixo de veiculo do Google News
 * (" - Jovem Pan"), cargo antes do nome ("Governador Clecio"), lista de nomes
 * ("Tebet, Derrite e Marina") e nome composto de terceiro citado junto. Nao
 * compensa: o criterio deste modulo e frouxo de proposito, na direcao segura.
 *
 * LIMITACAO CONHECIDA que sobra: homonimo que repete o nome de urna INTEIRO
 * (uma desembargadora "Vera Lucia" contra a candidata "Vera Lucia") passa pela
 * regra 1 e este modulo nao tem como separar os dois pelo titulo.
 */
export function newsTitleMentionsCandidate(
  titulo: string | null | undefined,
  candidato: CandidateNameInput,
): boolean {
  const title = normalizeNewsText(titulo)
  if (!title) return false

  const nomeUrna = normalizeNewsText(candidato.nome_urna)
  const nomeCompleto = normalizeNewsText(candidato.nome_completo)

  if (nomeUrna && containsWholeWords(title, nomeUrna)) return true
  if (nomeCompleto && containsWholeWords(title, nomeCompleto)) return true

  for (const apelido of candidato.apelidos ?? []) {
    const normalizado = normalizeNewsText(apelido)
    if (normalizado && containsWholeWords(title, normalizado)) return true
  }

  // Sigla/apelido curto: "JHC", "Zema", "Lula". O corte de 4 letras da
  // auditoria reprovava esses nomes por construcao, nao por ruido real.
  const urnaTokens = tokenize(nomeUrna)
  if (urnaTokens.length === 1 && urnaTokens[0].length <= SIGLA_CURTA_MAX) {
    return containsWholeWords(title, urnaTokens[0])
  }

  // ── Casamento por token solto, com o guarda de sobrenome compartilhado ───
  //
  // Ate 05/08/2026 bastava UM token distintivo de qualquer um dos dois nomes
  // aparecer no titulo. Isso entregava a materia do cabeca de chapa ao vice:
  // `ismar-marques` (nome completo "Ismar Aguiar Marques") recebeu duas
  // materias sobre ELIZEU AGUIAR, porque "aguiar" e token distintivo do nome
  // completo dele. As duas foram removidas a mao em 05/08 e voltaram sozinhas
  // no cron das 06:32 do mesmo dia, que e o motivo de o conserto morar aqui e
  // nao numa limpeza de banco.
  const distintivo = (token: string): boolean =>
    token.length >= TOKEN_DISTINTIVO_MIN && !PARTICULAS.has(token)

  const completoTokens = tokenize(nomeCompleto)

  const urnaDistintivos = urnaTokens.filter(distintivo)
  // Tokens que SO existem no nome completo (o "Aguiar" de "Ismar Aguiar
  // Marques"). Sao o vetor de colisao: o nome de urna e como a pessoa e
  // publicamente chamada, e o sobrenome extra costuma ser o que ela divide com
  // outra gente da mesma disputa.
  const soNoCompleto = completoTokens.filter(
    (token) => distintivo(token) && !urnaTokens.includes(token),
  )

  const casadosUrna = [...new Set(urnaDistintivos)].filter((token) =>
    containsWholeWords(title, token),
  )
  const casadosSoNoCompleto = [...new Set(soNoCompleto)].filter((token) =>
    containsWholeWords(title, token),
  )

  // O GUARDA: token exclusivo do nome completo nunca vale sozinho. Precisa de
  // um segundo pedaco do nome no mesmo titulo ("Luiz Inacio" continua casando
  // com Lula; "Elizeu Aguiar" sozinho nao casa mais com Ismar Aguiar Marques).
  if (casadosUrna.length > 0) return true
  return casadosSoNoCompleto.length >= 2
}

export interface NewsRelevanceSplit<T> {
  /** Itens cujo titulo cita o candidato. */
  mencionam: T[]
  /** Itens sem nenhuma mencao ao nome: cobertura do pleito, nao do candidato. */
  contextoDoPleito: T[]
}

/**
 * Separa uma lista de noticias entre as que citam o candidato e as que nao
 * citam. Quem consome decide o que fazer com o segundo grupo: a ingestao
 * descarta, a leitura rotula.
 */
export function splitNewsByCandidateMention<T extends { titulo?: string | null }>(
  items: readonly T[],
  candidato: CandidateNameInput,
): NewsRelevanceSplit<T> {
  const mencionam: T[] = []
  const contextoDoPleito: T[] = []

  for (const item of items) {
    if (newsTitleMentionsCandidate(item.titulo, candidato)) {
      mencionam.push(item)
    } else {
      contextoDoPleito.push(item)
    }
  }

  return { mencionam, contextoDoPleito }
}
