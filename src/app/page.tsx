import { getCandidatos } from "@/lib/api"
import { CandidatoCard } from "@/components/CandidatoCard"
import { MOCK_PATRIMONIO, MOCK_PROCESSOS } from "@/data/mock"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

export const revalidate = 3600

export default async function Home() {
  const candidatos = await getCandidatos()

  return (
    <main>
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Pre-candidatos a presidente 2026
        </h1>
        <p className="mt-2 text-muted-foreground">
          Consulte a ficha completa de cada candidato. Dados publicos oficiais do
          TSE, Camara e Senado.
        </p>
      </section>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar candidato por nome ou partido..."
          className="pl-10"
          disabled
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          Em breve
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {candidatos.map((c) => (
          <CandidatoCard
            key={c.id}
            candidato={c}
            processos={(MOCK_PROCESSOS[c.slug] ?? []).length}
            patrimonio={MOCK_PATRIMONIO[c.slug]?.[0]?.valor_total}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Dados de fontes publicas oficiais. Ultima atualizacao: {new Date().toLocaleDateString("pt-BR")}.
        Projeto de Thiago Salvador.
      </p>
    </main>
  )
}
