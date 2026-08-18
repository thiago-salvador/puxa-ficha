import Link from "next/link"

type Variant = "presidencia" | "governadores"

const baseClass =
  "text-[length:var(--text-eyebrow)] font-semibold leading-relaxed text-muted-foreground"

export function PublicDataSourcesNote({ variant }: { variant: Variant }) {
  if (variant === "presidencia") {
    return (
      <p className={baseClass}>
        Dados de candidatos: TSE (candidaturas, patrimônio, financiamento e certidões quando
        disponíveis), Câmara e Senado (votações e gastos parlamentares quando houver mandato).
        Processos e registros judiciais/administrativos: bases públicas consultadas e curadoria,
        quando disponíveis. Notícias: Google News. Contexto biográfico: Wikipedia e Wikidata onde
        aplicável.{" "}
        <Link href="/metodologia" className="font-bold text-foreground underline underline-offset-2">
          Fontes consultadas e metodologia
        </Link>
        .
      </p>
    )
  }

  return (
    <p className={baseClass}>
      Candidatos a governador: TSE. Valores no mapa (população, PIB, homicídios por 100 mil): séries
      públicas: IBGE (SIDRA), Ipeadata e Atlas da Violência (Ipea), conforme ingest no banco.{" "}
      <Link href="/metodologia" className="font-bold text-foreground underline underline-offset-2">
        Fontes consultadas e metodologia
      </Link>
      .
    </p>
  )
}
