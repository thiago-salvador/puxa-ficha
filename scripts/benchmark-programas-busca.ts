import { buscarProgramas } from "../src/lib/programa-governo-busca-server"

const terms = [
  "saude", "educacao", "trabalho", "moradia", "seguranca", "transporte", "renda",
  "meio ambiente", "democracia", "agua", "tarifa zero", "6×1", "salario", "policia",
  "saneamento", "habitacao", "juventude", "mulheres", "agricultura", "transparencia",
]

const query = (q: string) => ({ q, uf: "", cargo: "", candidato: "", pagina: 1 })

async function main() {
  const coldStart = performance.now()
  await buscarProgramas(query(terms[0]))
  const coldMs = performance.now() - coldStart

  const warmMs: number[] = []
  for (const term of terms) {
    const start = performance.now()
    await buscarProgramas(query(term))
    warmMs.push(performance.now() - start)
  }
  warmMs.sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(warmMs.length * 0.95) - 1)
  const memory = process.memoryUsage()
  console.log(JSON.stringify({
    coldMs: Math.round(coldMs * 100) / 100,
    warmP50Ms: Math.round(warmMs[Math.floor(warmMs.length * 0.5)] * 100) / 100,
    warmP95Ms: Math.round(warmMs[p95Index] * 100) / 100,
    warmMaxMs: Math.round(warmMs.at(-1)! * 100) / 100,
    terms: terms.length,
    rssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    arrayBuffersMb: Math.round(memory.arrayBuffers / 1024 / 1024),
  }))
}

void main()
