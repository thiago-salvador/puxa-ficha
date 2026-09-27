/** Sonda de leitura das cinco vias diretas no runner de PR, sem banco e sem Google. */
import { existsSync, readFileSync } from "node:fs"
import { AGENCIAS_CHECAGEM, parseArquivoArc, parseArquivoFalkor, parseBuscaSite, urlArquivoArc, urlBuscaSite } from "../lib/checagens-coleta"
import { parseArquivoUol, parseBuscaAfp } from "../lib/checagens-fontes-diretas"

const porId = (id: string) => {
  const agencia = AGENCIAS_CHECAGEM.find((item) => item.id === id)
  if (!agencia) throw new Error(`Agência ausente: ${id}`)
  return agencia
}

const falkor = porId("fato-ou-fake").arquivo
const arc = porId("estadao-verifica").arquivo
if (falkor?.tipo !== "falkor" || arc?.tipo !== "arc") throw new Error("Arquivo direto do g1 ou Estadão ausente")

const sondas: Array<{ id: string; url: string; valido: (body: string) => boolean }> = [
  { id: "aos-fatos", url: urlBuscaSite("Lula", porId("aos-fatos"), 1)!, valido: (body) => parseBuscaSite(body, porId("aos-fatos").buscaSite!).itens.length > 0 },
  { id: "fato-ou-fake", url: `${falkor.url}1`, valido: (body) => parseArquivoFalkor(body).itens.length > 0 },
  { id: "estadao-verifica", url: urlArquivoArc(arc, 0), valido: (body) => parseArquivoArc(body, "https://www.estadao.com.br").itens.length > 0 },
  { id: "uol-confere", url: "https://noticias.uol.com.br/confere/", valido: (body) => parseArquivoUol(body).itens.length > 0 },
  { id: "afp-checamos", url: "https://checamos.afp.com/fact-checking-search-results?search_api_fulltext=Lula", valido: (body) => parseBuscaAfp(body, "Lula").itens.length > 0 },
]

function fallbackLocalConfigurado(): boolean {
  const workflow = readFileSync(".github/workflows/checagens-coleta.yml", "utf8")
  const launcher = "scripts/checagens-local/coletar-local.sh"
  return existsSync(launcher)
    && existsSync("scripts/checagens-local/instalar-agente.sh")
    && existsSync("docs/operations/checagens-local.md")
    && workflow.includes("workflow_dispatch:")
    && !workflow.includes("schedule:")
    && !workflow.includes("SUPABASE_SERVICE_ROLE_KEY")
    && readFileSync(launcher, "utf8").includes("--sem-google")
}

async function main() {
  const erros: string[] = []
  const fallback = !process.argv.includes("--exigir-todas") && fallbackLocalConfigurado()
  for (const sonda of sondas) {
    try {
      const response = await fetch(sonda.url, {
        headers: { "user-agent": "node", accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9", "accept-language": "pt-BR,pt;q=0.9" },
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.text()
      if (!sonda.valido(body)) throw new Error("resposta sem itens reconhecíveis")
      console.log(`${sonda.id}: ok HTTP ${response.status}`)
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error)
      if ((sonda.id === "uol-confere" || sonda.id === "afp-checamos") && motivo === "HTTP 403" && fallback) {
        console.log(`${sonda.id}: HTTP 403 no runner; coleta agendada no agente local`)
        continue
      }
      erros.push(`${sonda.id}: ${motivo}`)
      console.error(`${sonda.id}: erro ${motivo}`)
    }
  }
  if (erros.length) throw new Error(`${erros.length} rota(s) diretas indisponíveis no runner: ${erros.join("; ")}`)
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
