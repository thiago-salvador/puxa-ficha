import Link from "next/link"
import { isSenadoEnabled } from "@/lib/senado-feature"

type Variant = "presidencia" | "governadores" | "parlamentares"

const baseClass =
  "text-[length:var(--text-eyebrow)] font-semibold leading-relaxed text-muted-foreground"

function MethodologyLink() {
  return (
    <Link href="/metodologia" className="font-bold text-foreground underline underline-offset-2">
      Fontes consultadas e metodologia
    </Link>
  )
}

export function PublicDataSourcesNote({
  variant,
  senadoEnabled = isSenadoEnabled(),
}: {
  variant: Variant
  senadoEnabled?: boolean
}) {
  if (variant === "presidencia") {
    return (
      <p className={baseClass}>
        Dados de candidatos: TSE (candidaturas, patrimônio, financiamento e certidões quando
        disponíveis), Câmara e Senado (votações e gastos parlamentares quando houver mandato).
        Processos e registros judiciais/administrativos: bases públicas consultadas e curadoria,
        quando disponíveis. Notícias: Google News. Contexto biográfico: Wikipedia e Wikidata onde
        aplicável. <MethodologyLink />.
      </p>
    )
  }

  if (variant === "parlamentares") {
    // Sem a flag do Senado não há mapa nem candidatos a senador publicados.
    if (!senadoEnabled) {
      return (
        <p className={baseClass}>
          <MethodologyLink />.
        </p>
      )
    }
    return (
      <p className={baseClass}>
        Candidatos a senador: TSE. Valores no mapa (população, PIB, homicídios por 100 mil): séries
        públicas: IBGE (SIDRA), Ipeadata e Atlas da Violência (Ipea), conforme ingest no banco.{" "}
        <MethodologyLink />.
      </p>
    )
  }

  return (
    <p className={baseClass}>
      Candidatos a governador: TSE. Valores no mapa (população, PIB, homicídios por 100 mil): séries
      públicas: IBGE (SIDRA), Ipeadata e Atlas da Violência (Ipea), conforme ingest no banco.{" "}
      <MethodologyLink />.
    </p>
  )
}
