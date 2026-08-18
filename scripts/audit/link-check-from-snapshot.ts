/**
 * Reprodução do gate `npm run data:link-check-fontes:gate` a partir de um
 * snapshot JSON de `pontos_atencao` (2026-08-02).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * O gate canônico lê o banco com `SUPABASE_SERVICE_ROLE_KEY`. Em máquina sem
 * essa credencial (o caso de um run de auditoria que é read-only por contrato),
 * o gate morre antes de sondar uma única URL. Este script injeta as MESMAS
 * linhas, vindas de um SELECT read-only, no MESMO `runLinkCheck`, com o MESMO
 * prober de rede e o MESMO critério de saída. O que muda é só a origem das
 * linhas; a lógica de veredito é a de `scripts/link-check-pontos-atencao.ts`,
 * importada, não recopiada.
 *
 * `despublicar` é um erro proposital: este caminho nunca escreve.
 *
 * Snapshot esperado (array JSON), do SELECT read-only:
 *   select jsonb_agg(jsonb_build_object(
 *     'id', pa.id, 'candidato_id', pa.candidato_id, 'titulo', pa.titulo,
 *     'gravidade', pa.gravidade, 'visivel', pa.visivel, 'fontes', pa.fontes,
 *     'dados_relacionados', pa.dados_relacionados,
 *     'publico', pa.candidato_id is not null and exists (
 *        select 1 from candidatos_publico cp where cp.id = pa.candidato_id))
 *     order by pa.id)
 *   from pontos_atencao pa;
 *
 * Uso:
 *   tsx scripts/audit/link-check-from-snapshot.ts --snapshot=PATH \
 *     --fail-on-dead --fail-on-sem-substancia --gate-somente-publicos
 */

import { readFileSync } from "node:fs"

import {
  estadoDesligado,
  mapPorHost,
  probeUrlReal,
  runLinkCheck,
  type ClaimVeredito,
  type PontoAtencaoLinkRow,
  type ProbeOpcoes,
} from "../link-check-pontos-atencao"

function flag(nome: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${nome}` || a.startsWith(`--${nome}=`))
  if (!hit) return undefined
  const i = hit.indexOf("=")
  return i === -1 ? "" : hit.slice(i + 1)
}

async function main(): Promise<void> {
  const snapshot = flag("snapshot")
  if (!snapshot) throw new Error("--snapshot=PATH é obrigatório")

  const failOnDead = flag("fail-on-dead") !== undefined
  const failOnSemSubstancia = flag("fail-on-sem-substancia") !== undefined
  const gateSomentePublicos = flag("gate-somente-publicos") !== undefined

  const rows = JSON.parse(readFileSync(snapshot, "utf8")) as PontoAtencaoLinkRow[]
  const opcoes: ProbeOpcoes = { timeoutMs: 20000, maxBytes: 512 * 1024, retryDelayMs: 5000 }

  const resultado = await runLinkCheck({
    apply: false,
    onlyVisible: false,
    limit: null,
    // Auditoria de snapshot é uma execução única e sem memória: a confirmação
    // em duas execuções (ver o cabeçalho de link-check-pontos-atencao.ts) nunca
    // acontece aqui. `estadoDesligado` degrada para o lado seguro (nada é
    // confirmado, nada é despublicável), e por isso o gate abaixo barra também
    // a morte SUSPEITA: sem isso, este caminho ficaria verde por construção.
    execucaoId: `snapshot-${new Date().toISOString()}`,
    estado: estadoDesligado(),
    intervaloConfirmacaoMs: 6 * 3600_000,
    fetchRows: async () => rows,
    probeUrls: (urls) => mapPorHost(urls, 6, 1500, (url) => probeUrlReal(url, opcoes)),
    despublicar: async () => {
      throw new Error("este caminho é read-only: despublicar não é permitido")
    },
    log: (m) => console.error(`[link-check-snapshot] ${m}`),
    warn: (m) => console.error(`[link-check-snapshot] ! ${m}`),
    error: (m) => console.error(`[link-check-snapshot] ✗ ${m}`),
    agora: () => new Date(),
  })

  if (resultado.erros > 0) process.exitCode = 1

  const noEscopo = (v: ClaimVeredito) => !gateSomentePublicos || v.publico

  // Com `estadoDesligado`, `claimsComFonteMorta` (confirmadas) é vazio por
  // construção; a lista que carrega o sinal numa execução única é a de morte
  // suspeita, mesmo critério do gate de pré-publicação (--fail-on-morte-suspeita).
  const mortas = [...resultado.claimsComFonteMorta, ...resultado.claimsComMorteSuspeita].filter(
    noEscopo
  )
  if (failOnDead && mortas.length > 0) {
    console.error(`[link-check-snapshot] ✗ ${mortas.length} claim(s) visível(is) com fonte morta ou suspeita de morte`)
    process.exitCode = 1
  }

  const semFonte = resultado.claimsSemFonteUtilizavel.filter(noEscopo)
  if (failOnSemSubstancia && semFonte.length > 0) {
    console.error(
      `[link-check-snapshot] ✗ ${semFonte.length} claim(s) publicada(s) sem fonte utilizável`
    )
    process.exitCode = 1
  }

  // Nomear quem derruba o gate: sem isto o operador só vê a contagem.
  for (const v of mortas) {
    console.error(`[link-check-snapshot] BLOQUEIA (fonte morta) ${v.id} [${v.gravidade}] "${v.titulo}" -> ${v.urlsMortas.join(", ")}`)
  }
  for (const v of semFonte) {
    console.error(
      `[link-check-snapshot] BLOQUEIA (sem fonte utilizável) ${v.id} [${v.gravidade}] "${v.titulo}" -> mortas=[${v.urlsMortas.join(", ")}] sem_substancia=[${v.urlsSemSubstancia.join(", ")}] sem_caminho=${v.semCaminho}`
    )
  }

  console.error(
    `[link-check-snapshot] claims=${resultado.claims} urls=${resultado.urlsUnicas} vivas=${resultado.urlsVivas} mortas=${resultado.urlsMortas} indisponiveis=${resultado.urlsIndisponiveis} sem_substancia=${resultado.urlsSemSubstancia}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
