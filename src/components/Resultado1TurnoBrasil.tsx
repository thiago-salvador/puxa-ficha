import { getEstadoNome, getEstadoUFs } from "@/lib/br-uf"
import {
  getDisputa1Turno,
  getResultados1Turno,
  hasResultados1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import type { FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { EspectroEleitos1Turno } from "@/components/EspectroEleitos1Turno"
import { SlashDivider } from "@/components/SlashDivider"
import { UfResultadoSelector } from "@/components/UfResultadoSelector"
import { RevelarBarras } from "@/components/RevelarBarras"
import { DueloSegundoTurno, VencedorDestaque } from "@/components/Resultado1TurnoDestaques"
import { Resultado1TurnoEstados } from "@/components/Resultado1TurnoEstados"
import {
  ResultadoFonte,
  ResultadoLinhas,
  ResultadoPreviaBanner,
  ResultadoTotais,
  ResultadoVazio,
  TituloSecao,
} from "@/components/Resultado1TurnoPartes"

/**
 * Resultado completo do 1º turno no Brasil. Fora de rota desde 06/10/2026: /1o-turno virou o
 * arquivo (a home como estava até a votação). `data` e `fotos` existem para teste; em uso,
 * lê o snapshot do módulo e recebe as fotos das fichas.
 */
export function Resultado1TurnoBrasil({
  data = getResultados1Turno(),
  fotos = {},
}: {
  data?: Resultados1Turno
  fotos?: FotosCandidatos
}) {
  const temResultado = hasResultados1Turno(data)
  const presidente = temResultado ? getDisputa1Turno("Presidente", "BR", data) : null
  const ufs = getEstadoUFs()
  const opcoes = ufs.map((uf) => ({ uf: uf.toUpperCase(), label: getEstadoNome(uf) ?? uf.toUpperCase() }))

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-5 pb-10 pt-28 sm:pb-14 sm:pt-32 md:px-12">
          <p className="text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Eleições 2026
          </p>
          <h1
            className="mt-3 font-heading uppercase leading-none text-foreground [text-wrap:balance]"
            style={{ fontSize: "clamp(36px, 7vw, 72px)" }}
          >
            Resultado do 1º turno
          </h1>
          {presidente && (
            <div className="mt-8 sm:mt-12">
              <p className="mb-5 text-[length:var(--text-body-sm)] font-bold uppercase tracking-[0.08em] text-foreground sm:text-center">
                Presidente
              </p>
              <DueloSegundoTurno disputa={presidente} fotos={fotos} />
              <VencedorDestaque disputa={presidente} fotos={fotos} />
              <ResultadoFonte disputa={presidente} className="mt-8 sm:mx-auto sm:text-center" />
            </div>
          )}
        </div>
      </section>

      {presidente && (
        <div className="border-b border-border">
          <div className="mx-auto max-w-7xl px-5 py-6 md:px-12">
            <ResultadoTotais disputa={presidente} />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-14 px-5 py-10 md:px-12">
        <ResultadoPreviaBanner data={data} />

        {!temResultado ? (
          <ResultadoVazio />
        ) : (
          <>
            <nav aria-label="Seções do resultado" className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border text-sm font-semibold">
              <a href="#presidente" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                Presidente
              </a>
              <a href="#estados" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                Por estado
              </a>
              <a href="#espectro" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                Espectro dos eleitos
              </a>
            </nav>

            <section id="presidente" className="scroll-mt-24" aria-labelledby="presidente-titulo">
              <TituloSecao titulo="Presidente" id="presidente-titulo">
                Todos os candidatos, com votos, % dos válidos e vice.
              </TituloSecao>
              <SlashDivider className="mb-6 mt-6" />
              {presidente ? (
                <ResultadoLinhas
                  disputa={presidente}
                  legenda="Resultado do 1º turno para Presidente, por votos"
                  fotos={fotos}
                />
              ) : (
                <p className="text-[length:var(--text-body)] font-medium text-muted-foreground">
                  O resultado de Presidente não está no arquivo do TSE usado nesta página.
                </p>
              )}
            </section>

            <section id="estados" className="scroll-mt-24" aria-labelledby="estados-titulo">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <TituloSecao titulo="Governador e Senado por estado" id="estados-titulo" />
                <div className="w-full max-w-sm">
                  <UfResultadoSelector options={opcoes} basePath="/1o-turno" />
                </div>
              </div>
              <SlashDivider className="mb-8 mt-6" />
              <Resultado1TurnoEstados ufs={ufs} data={data} fotos={fotos} />
            </section>

            <EspectroEleitos1Turno data={data} />
          </>
        )}
      </div>
      <RevelarBarras />
    </div>
  )
}
