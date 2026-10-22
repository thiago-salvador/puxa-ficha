import { createRoot } from "react-dom/client"
import { EvolucaoPesquisas2Turno } from "../../../src/components/EvolucaoPesquisas2Turno"
import type { Pesquisa2TurnoLinha } from "../../../src/lib/segundo-turno-2026"

const total = { chave: "total", rotulo: "Votos totais · Intenção de voto estimulada" }
const linha = (id: string, instituto: string, data: string | null, a: number, b: number, comparabilidade = total): Pesquisa2TurnoLinha => ({
  id, instituto, data, percentuais: [a, b], margem: 2, url: `https://example.org/${id}`, registro: `BR-${id}/2026`, comparabilidade,
})
const params = new URLSearchParams(location.search)
let linhas = [
  linha("1", "Instituto A", "2026-10-07", 47, 45),
  linha("2", "Instituto B", "2026-10-10", 49, 44),
  linha("3", "Instituto C", "2026-10-10", 47, 46),
  linha("4", "Instituto A", "2026-10-13", 47.5, 46),
  linha("5", "Instituto B", "2026-10-16", 48.2, 45.2),
  linha("6", "Instituto C", "2026-10-19", 48, 46),
  linha("7", "Instituto A", "2026-10-22", 48, 45),
  linha("8", "Instituto B", "2026-10-22", 48.4, 45.8),
  linha("9", "Instituto C", "2026-10-22", 48.8, 46.6),
  linha("10", "Instituto A", "2026-10-22", 52, 48, { chave: "validos", rotulo: "Votos válidos · Intenção de voto estimulada" }),
]
if (params.has("single")) linhas = [linhas[0]]
if (params.has("empty")) linhas = [{ ...linhas[0], data: null }]
if (params.has("tie")) linhas = linhas.filter(item => item.comparabilidade?.chave === "total").map(item => ({ ...item, percentuais: [48, 48] }))
if (params.has("crowded")) linhas = Array.from({ length: 8 }, (_, i) => linha(String(i), `Instituto ${i}`, "2026-10-22", 47 + i / 10, 45 + i / 10))

createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px", fontFamily: "var(--font-inter), sans-serif" }}>
  <h1 style={{ fontFamily: "var(--font-anton), sans-serif", textTransform: "uppercase", fontSize: "clamp(32px, 4vw, 56px)", lineHeight: 1.1, marginBottom: 16 }}>Pesquisas do 2º turno</h1>
  <p style={{ marginBottom: 32, color: "var(--muted-foreground)" }}>Flávio Bolsonaro × Lula · Dados de teste</p>
  <EvolucaoPesquisas2Turno linhas={linhas} nomes={["Flávio Bolsonaro", "Lula"]} cores={["var(--espectro-direita)", "var(--espectro-esquerda)"]} />
</main>)
