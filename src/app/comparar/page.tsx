import { getCandidatosComparaveis } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/utils"
import { User, AlertTriangle } from "lucide-react"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Comparador de candidatos — Puxa Ficha",
  description: "Compare 2 ou mais candidatos lado a lado: patrimonio, processos, partido, formacao.",
}

export const revalidate = 3600

export default async function CompararPage() {
  const candidatos = await getCandidatosComparaveis()

  return (
    <main>
      <h1 className="text-3xl font-bold tracking-tight">Comparador</h1>
      <p className="mt-2 mb-6 text-muted-foreground">
        Compare candidatos lado a lado. Clique em um candidato pra ver a ficha completa.
      </p>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3 text-left font-medium text-muted-foreground">Candidato</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Partido</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Idade</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Formacao</th>
              <th className="p-3 text-right font-medium text-muted-foreground">Patrimonio</th>
              <th className="p-3 text-center font-medium text-muted-foreground">Processos</th>
              <th className="p-3 text-center font-medium text-muted-foreground">Alertas</th>
            </tr>
          </thead>
          <tbody>
            {candidatos.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/50 transition-colors">
                <td className="p-3">
                  <Link href={`/candidato/${c.slug}`} className="flex items-center gap-3 hover:underline">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {c.foto_url ? (
                        <img src={c.foto_url} alt={c.nome_urna} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <span className="font-medium">{c.nome_urna}</span>
                  </Link>
                </td>
                <td className="p-3">
                  <Badge variant="outline">{c.partido_sigla}</Badge>
                </td>
                <td className="p-3 text-muted-foreground">{c.idade ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{c.formacao ?? "—"}</td>
                <td className="p-3 text-right font-medium">
                  {c.patrimonio_declarado ? formatBRL(c.patrimonio_declarado) : "—"}
                </td>
                <td className="p-3 text-center">
                  {c.total_processos > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      {c.total_processos}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {c.alertas_graves > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {c.alertas_graves}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {candidatos.map((c) => (
          <Link key={c.id} href={`/candidato/${c.slug}`}>
            <Card className="hover:border-foreground/20 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    {c.foto_url ? (
                      <img src={c.foto_url} alt={c.nome_urna} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <User className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.nome_urna}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.partido_sigla} {c.idade ? `· ${c.idade} anos` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {c.total_processos > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {c.total_processos} proc.
                      </Badge>
                    )}
                    {c.alertas_graves > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {c.alertas_graves}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="block font-medium text-foreground">Patrimonio</span>
                    {c.patrimonio_declarado ? formatBRL(c.patrimonio_declarado) : "Sem dados"}
                  </div>
                  <div>
                    <span className="block font-medium text-foreground">Formacao</span>
                    {c.formacao ?? "Sem dados"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Dados de fontes publicas oficiais (TSE, Camara, Senado). Patrimonio refere-se a ultima declaracao disponivel.
      </p>
    </main>
  )
}
