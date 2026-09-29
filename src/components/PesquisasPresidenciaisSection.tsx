"use client"

// cspell:ignore cenario periodo espontanea espontaneo secundario secundarios

import type {
  EstadoPesquisa,
  GrupoPesquisaDoCandidato,
  PesquisaEleitoralDoCandidato,
} from "@/lib/pesquisas-eleitorais"

interface PesquisasProps {
  pesquisas: PesquisaEleitoralDoCandidato[]
}

const ESTADO_LABEL: Record<EstadoPesquisa, string> = {
  publicado: "Publicado",
  antigo: "Pesquisa antiga",
  indeterminado: "Resultado indeterminado",
  erro: "Resultado indisponível",
  sem_pesquisa_qualificada: "Sem pesquisa qualificada",
}

function formatarDataIso(value: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "não informado"
}

export function formatarPeriodo(pesquisa: PesquisaEleitoralDoCandidato): string {
  const inicio = formatarDataIso(pesquisa.fieldwork.start.value)
  const fim = formatarDataIso(pesquisa.fieldwork.end.value)
  return inicio === fim ? inicio : `${inicio} a ${fim}`
}

export function resultadoPublicado(pesquisa: PesquisaEleitoralDoCandidato): boolean {
  return (
    pesquisa.state === "publicado" &&
    pesquisa.resultado.status === "publicado" &&
    pesquisa.resultado.valuePercent !== null
  )
}

export function resultadoLabel(pesquisa: PesquisaEleitoralDoCandidato): string {
  if (resultadoPublicado(pesquisa)) {
    return `${pesquisa.resultado.valuePercent!.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    })}%`
  }
  const state = pesquisa.state === "publicado" ? pesquisa.resultado.status : pesquisa.state
  return ESTADO_LABEL[state]
}

function doGrupo(
  pesquisas: PesquisaEleitoralDoCandidato[],
  grupo: GrupoPesquisaDoCandidato,
): PesquisaEleitoralDoCandidato[] {
  return pesquisas.filter((pesquisa) => (pesquisa.grupo ?? "recente") === grupo)
}

export function PesquisasPresidenciaisHero({ pesquisas }: PesquisasProps) {
  const primeiroTurno = doGrupo(pesquisas, "recente").filter(
    (pesquisa) => pesquisa.cenario.turn === 1 && resultadoPublicado(pesquisa),
  )
  // listarRodadasRecentesDoCandidato entrega as pesquisas em publicationDate
  // decrescente, com fieldwork.end como desempate. O primeiro resultado é a
  // pesquisa mais recente que permanece no cabeçalho.
  const pesquisa = primeiroTurno[0]

  if (!pesquisa) {
    return (
      <div
        data-pf-pesquisa-hero=""
        data-pf-pesquisa-hero-empty=""
        className="min-w-0 rounded-[14px] border border-border/70 bg-card px-4 py-3 lg:w-[220px]"
      >
        <p className="text-[length:var(--text-caption)] font-bold leading-snug text-foreground">
          Sem pesquisa qualificada recente
        </p>
      </div>
    )
  }

  return (
    <div
      data-pf-pesquisa-hero=""
      className="min-w-0 rounded-[14px] border border-border/70 bg-card px-4 py-3 lg:w-[220px]"
    >
      <p data-pf-pesquisa-hero-instituto="" className="truncate text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {pesquisa.instituto.value ?? "Instituto não informado"}
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p data-pf-pesquisa-hero-periodo="" className="min-w-0 text-[length:var(--text-eyebrow)] font-semibold leading-tight text-muted-foreground">
          {formatarPeriodo(pesquisa)}
        </p>
        <p data-pf-pesquisa-hero-resultado="" className="shrink-0 font-heading text-[30px] leading-none tabular-nums text-foreground">
          {resultadoLabel(pesquisa)}
        </p>
      </div>
    </div>
  )
}
