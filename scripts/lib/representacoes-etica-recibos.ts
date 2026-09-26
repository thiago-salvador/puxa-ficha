/**
 * Recibo por candidato da busca de representações ao Conselho de Ética
 * (Câmara, REP da legislatura 57; Senado, PCE com tramitação na legislatura).
 *
 * O recibo registra só a BUSCA: nenhum item é publicado por aqui. Publicação
 * continua nos aprovadores, depois de revisão humana. O objetivo é que
 * "sem representação" deixe de ser silêncio e passe a ser um estado checado.
 *
 * Regras, em ordem, por casa legislativa:
 *   encontrado     representação cujo alvo foi casado com o candidato;
 *   indeterminado  o candidato pode ser alvo e a fonte não permite fechar
 *                  (alvo ambíguo, identificador ausente, senador sem id no seed);
 *   vazio          é (ou foi) parlamentar da casa no recorte e nenhum alvo é ele;
 *   nao_aplicavel  não é parlamentar da casa no recorte.
 * O recibo final é o pior estado informativo das duas casas.
 */
import type { EntradaColeta, ResultadoColeta } from "./coleta-log"
import type { Fila } from "./representacoes-etica-coleta"
import type { FilaPceSenado, SenadorRosterPce } from "./representacoes-etica-senado"
import { stripAccents } from "../../src/lib/strip-accents"

export const FONTE_REPRESENTACOES = "representacoes-etica"

type EstadoCasa = "encontrado" | "indeterminado" | "vazio" | "nao_aplicavel"

export interface CandidatoPublicoRecibo {
  slug: string
  nome_completo: string
}

function normalizar(valor: unknown): string {
  return stripAccents(String(valor ?? "")).toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

function escapar(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export interface AlvoPce {
  /** Senadores do roster nomeados como representados na ementa oficial. */
  senador_ids: number[]
  /** Nome após "em face do Senador", mesmo quando não está no roster. */
  texto_alvo: string | null
  /** Sem representado individual: coletivo ("dos Senadores que...") ou ementa sem alvo. */
  sem_alvo_individual: boolean
}

/**
 * Fim do trecho do representado: o que vem depois (fundamento, autor,
 * motivo) nunca é alvo. "por representação do Senador Y" nomeia o AUTOR.
 */
const FIM_DO_ALVO = / (?:COM FUNDAMENTO|COM BASE|NOS TERMOS|NA FORMA|NO AMBITO|POR |PELO |PELA |PELOS |PELAS |EM RAZAO|EM DECORRENCIA|EM VIRTUDE|DEVIDO|TENDO EM VISTA|A RESPEITO|ACERCA|SOBRE |QUE |PARA |FORMULAD|APRESENTAD|DE AUTORIA|AUTOR)/

/** Segmento do representado: de "em face do Senador" até o primeiro marcador de fim. */
export function segmentoDoAlvoPce(ementa: string): { segmento: string; coletivo: boolean } | null {
  const texto = normalizar(ementa)
  const face = /\bEM FACE D([OA]S?) (?:EX )?SENADOR(?:A|ES|AS)? (.{2,240})/.exec(texto)
  if (!face) return null
  const segmento = face[2].split(FIM_DO_ALVO)[0].trim()
  return { segmento, coletivo: face[1].endsWith("S") }
}

/**
 * Lê o representado na ementa oficial ("em face do Senador X") e casa nomes
 * do roster SÓ dentro desse segmento. Vários alvos ligados por "e do Senador"
 * continuam no segmento; o autor e o fundamento ficam fora.
 */
export function alvoDaEmentaPce(ementa: string, roster: readonly SenadorRosterPce[]): AlvoPce {
  const recorte = segmentoDoAlvoPce(ementa)
  if (!recorte) return { senador_ids: [], texto_alvo: null, sem_alvo_individual: true }
  const { segmento, coletivo } = recorte
  // Inícios de nome: começo do segmento e depois de "E [DO|DA] [SENADOR(A)]".
  const inicios = [segmento, ...segmento.split(/ E (?:D[OA]S? )?(?:SENADOR(?:A|ES|AS)? )?/).slice(1)]
  const ids = new Set<number>()
  for (const senador of roster) {
    for (const nome of [senador.nome, senador.nome_completo].map(normalizar)) {
      if (!nome || nome.length < 4) continue
      const casa = nome.split(" ").length >= 2
        ? new RegExp(`\\b${escapar(nome)}\\b`).test(segmento)
        // Nome de um só token (nome parlamentar) só vale colado ao título.
        : inicios.some((trecho) => new RegExp(`^${escapar(nome)}\\b`).test(trecho))
      if (casa) ids.add(senador.senador_id)
    }
  }
  const semAlvo = ids.size === 0 && coletivo
  return { senador_ids: [...ids].sort((a, b) => a - b), texto_alvo: semAlvo || !segmento ? null : segmento, sem_alvo_individual: semAlvo || !segmento }
}

function pior(estados: EstadoCasa[]): EstadoCasa {
  for (const estado of ["encontrado", "indeterminado", "vazio"] as const) if (estados.includes(estado)) return estado
  return "nao_aplicavel"
}

const RESULTADO: Record<EstadoCasa, ResultadoColeta> = {
  encontrado: "encontrado",
  indeterminado: "indeterminado",
  vazio: "vazio_confirmado",
  nao_aplicavel: "nao_aplicavel",
}

export function montarRecibosRepresentacoes(opcoes: {
  publicos: readonly CandidatoPublicoRecibo[]
  camara: Fila
  senado: FilaPceSenado
}): EntradaColeta[] {
  const { publicos, camara, senado } = opcoes
  const cobertura = camara.cobertura
  if (!cobertura) throw new Error("fila da Câmara sem cobertura: rode o coletor atualizado")
  if (senado.itens.some((item) => item.documentos_estado === "falha")) {
    throw new Error("fila do Senado com documentos em falha; recibo exigiria vazio sobre busca incompleta")
  }

  // Câmara
  const deputadosPorSlug = new Map<string, number[]>()
  for (const d of cobertura.deputados_candidatos) deputadosPorSlug.set(d.slug, [...(deputadosPorSlug.get(d.slug) ?? []), d.deputado_id])
  const semIdentificador = new Set(cobertura.candidatos_sem_identificador)
  const itensCamara = new Map<string, string[]>()
  for (const item of camara.itens) {
    const rotulo = `REP ${item.representacao.numero}/${item.representacao.ano}`
    itensCamara.set(item.candidato.slug, [...new Set([...(itensCamara.get(item.candidato.slug) ?? []), rotulo])])
  }
  const deputadosAmbiguos = new Set(camara.alvos_nao_resolvidos.flatMap((a) => a.ambiguos.flatMap((x) => x.deputado_ids)))
  const bloqueados = new Set(cobertura.vinculos_bloqueados.map((b) => b.deputado_id))

  // Senado
  const senadoresPorSlug = new Map<string, number[]>()
  for (const [id, slugs] of Object.entries(senado.candidatos_por_senador_id)) {
    for (const slug of slugs) senadoresPorSlug.set(slug, [...(senadoresPorSlug.get(slug) ?? []), Number(id)])
  }
  const alvos = senado.itens.map((item) => ({ item, alvo: alvoDaEmentaPce(item.ementa_oficial, senado.roster) }))
  const semAlvoIndividual = alvos.filter((a) => a.alvo.sem_alvo_individual).map((a) => `PCE ${a.item.processo.numero}/${a.item.processo.ano}`)
  const nomeRoster = new Map<string, number[]>()
  for (const s of senado.roster) {
    const nome = normalizar(s.nome_completo)
    nomeRoster.set(nome, [...(nomeRoster.get(nome) ?? []), s.senador_id])
  }
  const idsNoRoster = new Set(senado.roster.map((s) => s.senador_id))

  return publicos.map((candidato) => {
    // --- Câmara
    const deputados = deputadosPorSlug.get(candidato.slug) ?? []
    const repsCamara = itensCamara.get(candidato.slug) ?? []
    let camaraEstado: EstadoCasa
    let camaraMotivo: string
    if (repsCamara.length > 0) {
      camaraEstado = "encontrado"; camaraMotivo = repsCamara.join(", ")
    } else if (deputados.some((id) => deputadosAmbiguos.has(id) || bloqueados.has(id))) {
      camaraEstado = "indeterminado"; camaraMotivo = "alvo de REP ambiguo ou vinculo bloqueado para o deputado"
    } else if (deputados.length > 0) {
      camaraEstado = "vazio"; camaraMotivo = `deputado ${deputados.join("/")} na legislatura ${camara.legislatura.id}, nenhuma REP com ele como alvo`
    } else if (semIdentificador.has(candidato.slug)) {
      camaraEstado = "indeterminado"; camaraMotivo = "sem ids.camara nem CPF do TSE para o cruzamento"
    } else {
      camaraEstado = "nao_aplicavel"; camaraMotivo = `nao casado com deputado da legislatura ${camara.legislatura.id}`
    }

    // --- Senado
    const senadoresLigados = (senadoresPorSlug.get(candidato.slug) ?? []).filter((id) => idsNoRoster.has(id))
    const senadoresPorNome = (nomeRoster.get(normalizar(candidato.nome_completo)) ?? []).filter((id) => !senadoresLigados.includes(id))
    const nomeCandidato = normalizar(candidato.nome_completo)
    const pceDoCandidato = alvos.filter((a) => a.alvo.senador_ids.some((id) => senadoresLigados.includes(id)))
      .map((a) => `PCE ${a.item.processo.numero}/${a.item.processo.ano}`)
    const pceNomeForaRoster = alvos.filter((a) => a.alvo.senador_ids.length === 0 && a.alvo.texto_alvo
      && nomeCandidato && new RegExp(`\\b${escapar(a.alvo.texto_alvo)}\\b`).test(nomeCandidato))
    let senadoEstado: EstadoCasa
    let senadoMotivo: string
    if (pceDoCandidato.length > 0) {
      senadoEstado = "encontrado"; senadoMotivo = pceDoCandidato.join(", ")
    } else if (senadoresPorNome.length > 0 || pceNomeForaRoster.length > 0) {
      senadoEstado = "indeterminado"; senadoMotivo = "nome coincide com senador ou representado sem ids.senado no seed"
    } else if (senadoresLigados.length > 0) {
      senadoEstado = "vazio"
      senadoMotivo = `senador ${senadoresLigados.join("/")}, nenhum PCE o nomeia como representado na ementa oficial`
        + (semAlvoIndividual.length > 0 ? `; sem representado individual e fora do escopo: ${semAlvoIndividual.join(", ")}` : "")
    } else {
      senadoEstado = "nao_aplicavel"; senadoMotivo = "nao consta no roster de senadores da legislatura"
    }

    const estado = pior([camaraEstado, senadoEstado])
    const volume = repsCamara.length + pceDoCandidato.length
    return {
      fonte: FONTE_REPRESENTACOES,
      alvo: candidato.slug,
      resultado: RESULTADO[estado],
      volume: estado === "encontrado" ? volume : 0,
      detalhe: [
        `camara: ${camaraEstado} (${camaraMotivo}); fonte ${camara.fonte}, REP da legislatura ${camara.legislatura.id}, coletado em ${camara.gerado_em}`,
        `senado: ${senadoEstado} (${senadoMotivo}); fonte ${senado.fonte}, PCE com tramitacao na legislatura ${senado.legislatura_recorte}, coletado em ${senado.gerado_em}`,
        "recibo de busca; publicacao so apos revisao humana",
      ].join(" | "),
      url: camaraEstado === "nao_aplicavel" && senadoEstado !== "nao_aplicavel"
        ? senado.fontes.processos
        : "https://dadosabertos.camara.leg.br/api/v2/proposicoes?siglaTipo=REP",
    }
  })
}
