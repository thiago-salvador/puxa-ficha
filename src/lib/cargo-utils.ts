/**
 * Cargo canônico para deduplicação e UNIQUE (candidato_id, cargo_canonico, periodo_inicio).
 * Mantido alinhado a `scripts/lib/cargo-utils.ts` (re-export) e ingestões TSE/Wikidata.
 */

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

/**
 * Reduz variantes de texto (TSE vs Wikidata vs manual) a uma chave estável.
 */
/**
 * Prefixo de candidatura no texto do cargo: "Candidatura a Vereador",
 * "Candidato a Prefeito", "Pré-candidata a Governadora".
 *
 * Ele não é cargo, é `tipo_evento`, e a coluna `tipo_evento` já guarda essa
 * informação. Deixá-lo dentro do canônico quebrava o casamento com as listas de
 * cargo: `CARGOS_ELETIVOS` (régua de cobertura) tem "Vereador" e não
 * "Candidatura a Vereador", então `declarouAoTse` dava falso e financiamento
 * saía como "não se aplica" em vez de lacuna.
 *
 * O bug era silencioso e assimétrico, que é o pior tipo: "Candidatura a
 * Deputado Federal" JÁ canonizava certo, porque a regra de deputado não é
 * ancorada em `^`; "Candidatura a Vereador" não, porque a de vereador é.
 */
const PREFIXO_CANDIDATURA = /^(?:pre[- ]?)?candidat(?:ura|o|a)\s+(?:a|ao|à|as|aos)\s+/

/** Mesmo prefixo, na string original, para o fallback preservar acento e caixa. */
const PREFIXO_CANDIDATURA_BRUTO =
  /^(?:pré|pre)?[- ]?candidat(?:ura|o|a)\s+(?:a|ao|à|as|aos)\s+/i

export function canonicalCargo(cargo: string): string {
  // O prefixo sai TAMBEM do bruto: sem isso, cargo que nao casa com nenhuma
  // regra abaixo (ex.: "Candidatura a 1o Suplente Senador") voltava com o
  // prefixo pelo fallback, e o canonico continuava divergindo da lista.
  const raw = cargo.trim().replace(PREFIXO_CANDIDATURA_BRUTO, "").trim()
  if (!raw) return raw
  const s = strip(raw).replace(PREFIXO_CANDIDATURA, "")
  const role = s.replace(/[()]/g, " ").replace(/\s+/g, " ").trim()
  const compactRole = role.replace(/\b([oa])\b/g, " ").replace(/\s+/g, " ").trim()

  if (/^vice[- ]president[ea]/.test(compactRole)) return "Vice-Presidente"
  if (
    compactRole === "presidente" ||
    compactRole.includes("presidente da republica") ||
    compactRole.includes("presidente do brasil")
  ) {
    return "Presidente"
  }
  if (/^vice[- ]governador[ae]?/.test(compactRole)) return "Vice-Governador"
  if (/^governador[ae]?/.test(compactRole)) return "Governador"
  if (/^vice[- ]prefeit[oa]/.test(compactRole)) return "Vice-Prefeito"
  if (/^prefeit[oa]/.test(compactRole)) return "Prefeito"
  if (/deputad[oa]?\s+federal/.test(compactRole)) return "Deputado Federal"
  if (/deputad[oa]?\s+estadual/.test(compactRole)) return "Deputado Estadual"
  if (/deputad[oa]?\s+distrital/.test(compactRole)) return "Deputado Distrital"
  if (/^senador(?:a)?(?:\b|$)/.test(compactRole)) return "Senador"
  if (/^vereador(?:a)?(?:\b|$)/.test(compactRole)) return "Vereador"
  if (compactRole.includes("presidente do sebrae")) return "Presidente do Sebrae"
  if (/^ministr[oa]/.test(compactRole)) return raw.replace(/\s+/g, " ").trim()
  if (/^secretari[oa]/.test(compactRole)) {
    if (compactRole.includes("de estado")) return "Secretário"
    return raw.replace(/\s+/g, " ").trim()
  }

  return raw.replace(/\s+/g, " ").trim()
}
