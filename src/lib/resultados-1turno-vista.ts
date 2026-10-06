/**
 * Helpers puros de apresentação do resultado do 1º turno: fotos por slug,
 * agrupamento das linhas, divisão dos votos válidos e a geometria do
 * hemiciclo. Nada aqui busca dado nem altera o snapshot do TSE.
 */
import type { CandidatoResultado1Turno, DisputaResultado1Turno } from "@/lib/resultados-1turno"

/** Foto por slug da ficha; ausência ou null cai nas iniciais do CandidatePhoto. */
export type FotosCandidatos = Record<string, string | null>

export function fotosDosCandidatos(lista: Array<{ slug?: string | null; foto_url?: string | null }>): FotosCandidatos {
  const fotos: FotosCandidatos = {}
  for (const c of lista) {
    if (!c.slug) continue
    if (fotos[c.slug]) continue
    fotos[c.slug] = c.foto_url ?? null
  }
  return fotos
}

export function fotoDe(fotos: FotosCandidatos | undefined, slug: string | null): string | null {
  if (!slug || !fotos) return null
  return fotos[slug] ?? null
}

/** Largura da barra em % (escala fixa de 0 a 100% dos válidos), com piso visível para valores mínimos. */
export function larguraBarra(percentual: number | null): number {
  if (percentual === null || !Number.isFinite(percentual) || percentual <= 0) return 0
  return Math.min(100, Math.max(0.4, percentual))
}

export interface GruposResultado {
  /** Eleitos ou finalistas do 2º turno, na ordem de votos. */
  destaque: CandidatoResultado1Turno[]
  /** Demais candidatos com voto válido. */
  demais: CandidatoResultado1Turno[]
  /** Voto não válido (ex.: anulado sub judice): sem posição, vai ao fim. */
  anulados: CandidatoResultado1Turno[]
}

export function agruparResultado(disputa: DisputaResultado1Turno): GruposResultado {
  const validos = disputa.candidatos.filter((c) => c.posicao !== null)
  return {
    destaque: validos.filter((c) => c.fase === "eleito" || c.fase === "segundo_turno"),
    demais: validos.filter((c) => c.fase !== "eleito" && c.fase !== "segundo_turno"),
    anulados: disputa.candidatos.filter((c) => c.posicao === null),
  }
}

export interface DivisaoVotos {
  finalistas: CandidatoResultado1Turno[]
  demais: { candidatos: number; votos: number; percentual: number }
}

/** Finalistas (ou eleito) e a soma dos demais votos válidos, a partir das linhas do TSE. */
export function dividirVotosValidos(disputa: DisputaResultado1Turno): DivisaoVotos {
  const { destaque, demais } = agruparResultado(disputa)
  return {
    finalistas: destaque,
    demais: {
      candidatos: demais.length,
      votos: demais.reduce((s, c) => s + c.votos, 0),
      percentual: demais.reduce((s, c) => s + (c.percentual_validos ?? 0), 0),
    },
  }
}

export interface Assento {
  x: number
  y: number
}

export interface Hemiciclo {
  largura: number
  altura: number
  raioAssento: number
  /** Ordenados da esquerda para a direita (ângulo de 180° a 0°). */
  assentos: Assento[]
}

/**
 * Posições de um hemiciclo com `total` assentos. As fileiras recebem assentos
 * proporcionais ao comprimento do arco; a ordem final varre o arco da esquerda
 * para a direita, então blocos consecutivos formam fatias.
 */
export function montarHemiciclo(total: number, largura = 400): Hemiciclo {
  const margem = 4
  const externo = largura / 2 - margem
  const interno = externo * 0.38
  if (total <= 0) return { largura, altura: externo + margem * 2, raioAssento: 0, assentos: [] }

  // Fileiras em que o espaço no arco fica próximo do espaço entre fileiras.
  const fator = (2 * (externo - interno)) / (Math.PI * (externo + interno))
  const fileiras = Math.max(1, Math.round((1 + Math.sqrt(1 + 4 * fator * total)) / 2))
  const raios = Array.from({ length: fileiras }, (_, i) =>
    fileiras === 1 ? (externo + interno) / 2 : interno + ((externo - interno) * i) / (fileiras - 1),
  )
  const somaRaios = raios.reduce((s, r) => s + r, 0)
  const porFileira = raios.map((r) => Math.floor((total * r) / somaRaios))
  let sobra = total - porFileira.reduce((s, n) => s + n, 0)
  for (let i = fileiras - 1; sobra > 0; i = i === 0 ? fileiras - 1 : i - 1) {
    porFileira[i] += 1
    sobra -= 1
  }

  const espacoArco = (Math.PI * somaRaios) / total
  const espacoFileira = fileiras > 1 ? (externo - interno) / (fileiras - 1) : espacoArco
  const raioAssento = Math.min(Math.min(espacoArco, espacoFileira) * 0.42, largura * 0.035)
  const cx = largura / 2
  const cy = externo + margem

  const comAngulo: Array<Assento & { angulo: number; raio: number }> = []
  raios.forEach((r, i) => {
    const n = porFileira[i]
    for (let j = 0; j < n; j++) {
      const angulo = n === 1 ? Math.PI / 2 : Math.PI * (1 - j / (n - 1))
      comAngulo.push({ x: cx + r * Math.cos(angulo), y: cy - r * Math.sin(angulo), angulo, raio: r })
    }
  })
  comAngulo.sort((a, b) => b.angulo - a.angulo || a.raio - b.raio)

  return {
    largura,
    altura: cy + raioAssento + margem,
    raioAssento,
    assentos: comAngulo.map(({ x, y }) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })),
  }
}
