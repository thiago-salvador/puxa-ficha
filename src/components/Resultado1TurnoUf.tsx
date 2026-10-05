import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getEstadoComPreposicao, getEstadoNome } from "@/lib/br-uf"
import {
  getDisputa1Turno,
  getResultados1Turno,
  hasResultados1Turno,
  href1Turno,
  type DisputaResultado1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import type { FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { SlashDivider } from "@/components/SlashDivider"
import { RevelarBarras } from "@/components/RevelarBarras"
import { DueloSegundoTurno, SenadoresEleitos, VencedorDestaque } from "@/components/Resultado1TurnoDestaques"
import {
  ResultadoFonte,
  ResultadoLinhas,
  ResultadoPreviaBanner,
  ResultadoTotais,
  ResultadoVazio,
  TituloSecao,
} from "@/components/Resultado1TurnoPartes"

function BlocoDisputa({
  disputa,
  cargo,
  legenda,
  fotos,
}: {
  disputa: DisputaResultado1Turno | null
  cargo: string
  legenda: string
  fotos?: FotosCandidatos
}) {
  if (!disputa) {
    return (
      <p className="text-[length:var(--text-body)] font-medium text-muted-foreground">
        O resultado de {cargo} não está no arquivo do TSE usado nesta página.
      </p>
    )
  }
  return (
    <div className="space-y-6">
      <ResultadoLinhas disputa={disputa} legenda={legenda} fotos={fotos} />
      <ResultadoTotais disputa={disputa} />
      <ResultadoFonte disputa={disputa} />
    </div>
  )
}

/** Página do 1º turno em uma UF. `uf` já validada pela rota; `data` e `fotos` existem para teste. */
export function Resultado1TurnoUf({
  uf,
  data = getResultados1Turno(),
  fotos = {},
}: {
  uf: string
  data?: Resultados1Turno
  fotos?: FotosCandidatos
}) {
  const nome = getEstadoNome(uf) ?? uf.toUpperCase()
  // "no Rio de Janeiro", "na Bahia", "em São Paulo": a mesma regra das páginas de estado.
  const emEstado = getEstadoComPreposicao(uf, "em") ?? `em ${nome}`
  const sigla = uf.toUpperCase()
  const temResultado = hasResultados1Turno(data)
  const governador = temResultado ? getDisputa1Turno("Governador", uf, data) : null
  const senado = temResultado ? getDisputa1Turno("Senador", uf, data) : null

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-5 pb-10 pt-28 sm:pb-14 sm:pt-32 md:px-12">
          <Link
            href={href1Turno()}
            className="inline-flex min-h-11 items-center gap-2 text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden="true" />
            Resultado do 1º turno no Brasil
          </Link>
          <h1
            className="mt-4 font-heading uppercase leading-none text-foreground [text-wrap:balance]"
            style={{ fontSize: "clamp(36px, 7vw, 72px)" }}
          >
            1º turno {emEstado}
          </h1>
          {governador && (
            <div className="mt-8 sm:mt-10">
              <p className="mb-5 text-[length:var(--text-body-sm)] font-bold uppercase tracking-[0.08em] text-foreground">
                Governador
              </p>
              <DueloSegundoTurno disputa={governador} fotos={fotos} tamanho="medio" />
              <VencedorDestaque disputa={governador} fotos={fotos} />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-14 px-5 py-10 md:px-12">
        <ResultadoPreviaBanner data={data} />

        {!temResultado ? (
          <ResultadoVazio />
        ) : (
          <>
            <section id="governador" className="scroll-mt-24" aria-labelledby="governador-titulo">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <TituloSecao titulo={`Governador ${emEstado}`} id="governador-titulo" />
                <Link
                  href={`/uf/${uf.toLowerCase()}`}
                  className="inline-flex min-h-11 items-center text-[length:var(--text-body-sm)] font-bold underline underline-offset-4"
                >
                  Finalistas e fichas de {sigla}
                </Link>
              </div>
              <SlashDivider className="mb-6 mt-6" />
              <BlocoDisputa
                disputa={governador}
                cargo="Governador"
                legenda={`Resultado do 1º turno para Governador ${emEstado}, por votos`}
                fotos={fotos}
              />
            </section>

            <section id="senado" className="scroll-mt-24" aria-labelledby="senado-titulo">
              <TituloSecao titulo={`Senado ${emEstado}`} id="senado-titulo">
                {senado ? `${senado.vagas} vagas. ` : ""}Cada chapa tem 1º e 2º suplentes.
              </TituloSecao>
              <SlashDivider className="mb-6 mt-6" />
              {senado && (
                <div className="mb-8">
                  <SenadoresEleitos disputa={senado} fotos={fotos} />
                </div>
              )}
              <BlocoDisputa
                disputa={senado}
                cargo="Senado"
                legenda={`Resultado do 1º turno para Senado ${emEstado}, por votos`}
                fotos={fotos}
              />
            </section>

            <p>
              <Link
                href={href1Turno()}
                className="inline-flex min-h-11 items-center gap-2 text-[length:var(--text-body-sm)] font-bold underline underline-offset-4"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Voltar ao resultado do Brasil
              </Link>
            </p>
          </>
        )}
      </div>
      <RevelarBarras />
    </div>
  )
}
