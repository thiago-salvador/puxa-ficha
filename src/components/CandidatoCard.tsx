import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatBRL } from "@/lib/utils"
import type { Candidato } from "@/lib/types"
import { User, AlertTriangle } from "lucide-react"

interface CandidatoCardProps {
  candidato: Candidato
  processos?: number
  patrimonio?: number | null
}

export function CandidatoCard({ candidato, processos = 0, patrimonio }: CandidatoCardProps) {
  return (
    <Link href={`/candidato/${candidato.slug}`}>
      <Card className="group h-full transition-all hover:shadow-md hover:border-foreground/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted">
              {candidato.foto_url ? (
                <img
                  src={candidato.foto_url}
                  alt={candidato.nome_urna}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <User className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold leading-tight group-hover:underline">
                {candidato.nome_urna}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {candidato.partido_sigla}
                {candidato.cargo_atual ? ` · ${candidato.cargo_atual}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">
              {candidato.cargo_disputado}
            </Badge>
            {candidato.idade && (
              <Badge variant="outline" className="text-xs">
                {candidato.idade} anos
              </Badge>
            )}
            {processos > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {processos} processo{processos > 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          {patrimonio != null && patrimonio > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Patrimonio declarado: <span className="font-medium text-foreground">{formatBRL(patrimonio)}</span>
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
