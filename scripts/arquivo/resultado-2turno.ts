/**
 * Resultado oficial do 2º turno para a home do arquivo.
 *
 * Lê o plano que `npm run resultados:tse -- plano --turno=2` grava (fontes do
 * TSE e slug de cada candidatura), baixa de novo cada arquivo, valida com o
 * mesmo leitor do pipeline de fase e grava src/data/resultados-2turno-2026.json.
 * Recusa gravar se algum arquivo faltar, não estiver totalizado ou mudar de forma.
 *
 * Uso:
 *   npm run resultados:tse -- plano --turno=2 --out=<pasta>
 *   node --import tsx scripts/arquivo/resultado-2turno.ts --plano=<pasta>/plano-turno-2.json
 *        [--out=src/data/resultados-2turno-2026.json]
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { lerArquivoResultado, type ArquivoAlvo, type CargoResultado } from "../lib/resultados-tse"

const USER_AGENT = "puxa-ficha-resultados/1.0 (+https://puxaficha.com.br)"

interface PlanoTurno2 {
  turno: number
  status: string
  eleicoes: { federal: string; estadual: string }
  fontes: Array<{ chave: string; url: string }>
  mudancas: Array<{ slug: string; sq: string }>
}

function argumento(nome: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
}

async function main() {
  const caminhoPlano = argumento("plano")
  if (!caminhoPlano) throw new Error("--plano=<plano-turno-2.json> é obrigatório")
  const out = argumento("out") ?? "src/data/resultados-2turno-2026.json"
  const plano = JSON.parse(readFileSync(caminhoPlano, "utf8")) as PlanoTurno2
  if (plano.turno !== 2 || plano.status !== "completo") throw new Error(`plano precisa ser do 2º turno e completo (turno ${plano.turno}, ${plano.status})`)
  const slugPorSq = new Map(plano.mudancas.map((m) => [m.sq, m.slug]))

  const disputas = []
  for (const fonte of plano.fontes) {
    const [cargo, abrangencia] = fonte.chave.split(":") as [CargoResultado, string]
    const alvo: ArquivoAlvo = {
      chave: fonte.chave,
      cargo,
      abrangencia,
      eleicao: cargo === "Presidente" ? plano.eleicoes.federal : plano.eleicoes.estadual,
      url: fonte.url,
    }
    const r = await fetch(alvo.url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(30_000) })
    if (!r.ok) throw new Error(`${alvo.chave}: HTTP ${r.status}`)
    const leitura = lerArquivoResultado(alvo, 2, await r.text())
    if (!leitura.ok) throw new Error(`${alvo.chave}: ${leitura.motivo}`)
    if (!leitura.final) throw new Error(`${alvo.chave}: arquivo não totalizado`)
    const candidatos = leitura.candidatos.map((c) => {
      const slug = slugPorSq.get(c.sq)
      if (!slug) throw new Error(`${alvo.chave}: candidatura ${c.sq} fora do plano`)
      return {
        sq: c.sq,
        slug,
        numero: c.numero,
        nome: c.nome,
        nome_urna: c.nomeUrna,
        partido: c.partido,
        votos: c.votos,
        percentual_validos: c.percentualValidos,
        situacao_tse: c.situacao,
        eleito: c.eleito,
      }
    })
    if (candidatos.filter((c) => c.eleito).length !== 1) throw new Error(`${alvo.chave}: esperado um eleito`)
    disputas.push({
      cargo,
      uf: abrangencia,
      fonte: { url: alvo.url, sha256: leitura.sha256, gerado_tse: leitura.geradoEm },
      totais: {
        votos_validos: leitura.totais.votosValidos,
        comparecimento: leitura.totais.comparecimento,
        eleitorado: leitura.totais.eleitorado,
      },
      candidatos: candidatos.sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0)),
    })
  }
  if (!disputas.some((d) => d.cargo === "Presidente")) throw new Error("plano sem a disputa presidencial")

  const snapshot = {
    versao: 1,
    turno: 2,
    status: "final",
    data_eleicao: "2026-10-25",
    gerado_em: new Date().toISOString(),
    disputas: disputas.sort((a, b) => (a.cargo === b.cargo ? a.uf.localeCompare(b.uf) : a.cargo === "Presidente" ? -1 : 1)),
  }
  // Temporário e rename: uma queda no meio não deixa o snapshot truncado.
  writeFileSync(`${out}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`)
  renameSync(`${out}.tmp`, out)
  console.log(`gravado ${out}: ${disputas.length} disputas`)
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
