import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getEstadoNome } from "@/lib/br-uf"
import {
  formatarPercentual,
  formatarVotos,
  getResultadoDoCandidato1Turno,
  getResultados1Turno,
  hasResultados1Turno,
  href1Turno,
  rotuloCompanheiro1Turno,
  rotuloRegistroForaDoResultado,
  type CandidatoResultado1Turno,
  type ResultadoDoCandidato1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import { larguraBarra } from "@/lib/resultados-1turno-vista"
import { ResultadoFonte, ResultadoPreviaBanner, ROTULO, SeloFase } from "@/components/Resultado1TurnoPartes"

const CARGOS_COM_RESULTADO = new Set(["Presidente", "Governador", "Senador"])

const PONTOS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1.234 votos (0,56 ponto percentual)" a partir da diferença entre dois candidatos vizinhos. */
function diferenca(a: CandidatoResultado1Turno, b: CandidatoResultado1Turno): string {
  const votos = Math.abs(a.votos - b.votos)
  const pontos =
    a.percentual_validos === null || b.percentual_validos === null
      ? null
      : Math.abs(a.percentual_validos - b.percentual_validos)
  const textoPontos = pontos === null ? "" : ` e ${PONTOS.format(pontos)} pontos percentuais`
  return `${formatarVotos(votos)} votos${textoPontos}`
}

/** Faixa da disputa: cada candidato válido é um segmento proporcional; este em preto. */
function FaixaDisputa({ resultado }: { resultado: ResultadoDoCandidato1Turno }) {
  const validos = resultado.disputa.candidatos.filter((c) => c.posicao !== null)
  const valido = resultado.candidato.posicao !== null
  const rotulo = valido
    ? `Divisão dos votos válidos entre ${validos.length} candidatos, em ordem de votos. ${resultado.candidato.nome_urna} é o ${resultado.candidato.posicao}º, com ${formatarPercentual(resultado.candidato.percentual_validos)}.`
    : `Divisão dos votos válidos entre ${validos.length} candidatos. ${resultado.candidato.nome_urna} não entra: voto ${resultado.candidato.destinacao.toLowerCase()}.`
  return (
    <div className="space-y-1.5">
      <div role="img" aria-label={rotulo} className="pf-barra pf-barra-entrada flex h-3 w-full gap-px overflow-hidden rounded-full bg-secondary">
        {validos.map((c) => (
          <span
            key={c.sq}
            className={`block h-full ${c.sq === resultado.candidato.sq ? "bg-foreground" : "bg-[var(--gray-300)]"}`}
            style={{ width: `${larguraBarra(c.percentual_validos)}%` }}
          />
        ))}
      </div>
      <p aria-hidden="true" className="text-[length:var(--text-caption)] font-medium text-muted-foreground">
        Votos válidos da disputa, um segmento por candidato{valido ? "; em preto, esta candidatura" : ""}.
      </p>
    </div>
  )
}

/**
 * Bloco "Resultado no 1º turno" da ficha. `data` existe para teste; em produção
 * lê o snapshot do módulo. Sem resultado publicado não renderiza nada.
 */
export function ResultadoNoPrimeiroTurno({
  slug,
  cargo,
  situacaoCandidatura,
  data = getResultados1Turno(),
}: {
  slug: string
  cargo: string | null | undefined
  /** Situação do registro na ficha; só com registro não deferido a ficha afirma que não está no resultado. */
  situacaoCandidatura?: string | null
  data?: Resultados1Turno
}) {
  if (!cargo || !CARGOS_COM_RESULTADO.has(cargo)) return null
  if (!hasResultados1Turno(data)) return null

  // A ficha só mostra a disputa do próprio cargo, nunca a de outro cargo com o mesmo slug.
  const achado = getResultadoDoCandidato1Turno(slug, data)
  const resultado = achado && achado.disputa.cargo === cargo ? achado : null
  const registroFora = resultado ? null : rotuloRegistroForaDoResultado(situacaoCandidatura)
  // Sem linha no TSE e registro deferido (ou sem registro): não há o que afirmar com segurança.
  if (!resultado && !registroFora) return null
  const valido = resultado?.candidato.posicao !== null
  const local = resultado
    ? resultado.disputa.cargo === "Presidente"
      ? "Brasil"
      : (getEstadoNome(resultado.disputa.uf) ?? resultado.disputa.uf)
    : null

  return (
    <section
      id="resultado-1-turno"
      data-pf-ficha-resultado-1turno={resultado ? "com-linha" : "sem-linha"}
      aria-labelledby="resultado-1-turno-titulo"
      className="mx-auto max-w-7xl scroll-mt-24 px-5 py-6 md:px-12"
    >
      <div className="rounded-[12px] border border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <h2
              id="resultado-1-turno-titulo"
              className="font-heading uppercase leading-[0.95] text-foreground [text-wrap:balance]"
              style={{ fontSize: "clamp(24px, 4vw, 36px)" }}
            >
              Resultado no 1º turno
            </h2>
            {resultado && (
              <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                {resultado.disputa.cargo} · {local}
              </p>
            )}
          </div>
          {resultado && <SeloFase candidato={resultado.candidato} cargo={resultado.disputa.cargo} />}
        </div>

        <div className="mt-4 space-y-5">
          <ResultadoPreviaBanner data={data} />
          {resultado ? (
            <>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <p className="leading-none">
                  {valido ? (
                    <>
                      <span className="block font-heading text-5xl tabular-nums text-foreground sm:text-6xl">
                        {formatarPercentual(resultado.candidato.percentual_validos)}
                      </span>
                      <span className="mt-1 block text-[length:var(--text-caption)] font-medium text-muted-foreground">
                        dos votos válidos
                      </span>
                    </>
                  ) : (
                    <span className="block font-heading text-3xl uppercase text-foreground">Não entra nos válidos</span>
                  )}
                </p>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 pb-0.5 sm:divide-x sm:divide-border">
                  <div className="sm:pr-6">
                    <dt className={`${ROTULO} text-muted-foreground`}>Posição</dt>
                    <dd className="mt-0.5 text-[length:var(--text-body-lg)] font-bold tabular-nums">
                      {valido
                        ? `${resultado.candidato.posicao}º de ${resultado.total}`
                        : `Voto ${resultado.candidato.destinacao.toLowerCase()}`}
                    </dd>
                  </div>
                  <div className="sm:pl-6">
                    <dt className={`${ROTULO} text-muted-foreground`}>Votos</dt>
                    <dd className="mt-0.5 text-[length:var(--text-body-lg)] font-bold tabular-nums">
                      {formatarVotos(resultado.candidato.votos)}
                    </dd>
                  </div>
                </dl>
              </div>

              <FaixaDisputa resultado={resultado} />

              <ul className="space-y-1 text-[length:var(--text-body-sm)] font-medium leading-relaxed text-foreground">
                {resultado.anterior && (
                  <li>
                    Para alcançar {resultado.anterior.nome_urna} ({resultado.anterior.posicao ?? ""}º) faltaram{" "}
                    {diferenca(resultado.anterior, resultado.candidato)}.
                  </li>
                )}
                {resultado.proximo && (
                  <li>
                    À frente de {resultado.proximo.nome_urna} ({resultado.proximo.posicao ?? ""}º) por{" "}
                    {diferenca(resultado.candidato, resultado.proximo)}.
                  </li>
                )}
                {resultado.candidato.companheiros.map((c) => (
                  <li key={`${c.tipo}-${c.nome}`}>
                    {rotuloCompanheiro1Turno(c.tipo)}: {c.nome}
                    {c.partido ? ` (${c.partido})` : ""}
                  </li>
                ))}
                <li className="text-muted-foreground">
                  Na disputa: {formatarVotos(resultado.disputa.totais.votos_validos)} votos válidos e comparecimento de{" "}
                  {formatarPercentual(resultado.disputa.totais.percentual_comparecimento)}.
                </li>
              </ul>

              <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <Link
                  href={href1Turno(resultado.disputa.cargo === "Presidente" ? null : resultado.disputa.uf)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[length:var(--text-body-sm)] font-bold underline underline-offset-4"
                >
                  {resultado.disputa.cargo === "Presidente" ? "Arquivo do 1º turno" : "Ver resultado completo"}<ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
                <ResultadoFonte disputa={resultado.disputa} className="sm:text-right" />
              </div>
            </>
          ) : (
            <p className="text-[length:var(--text-body)] font-medium text-foreground">
              Esta candidatura não aparece no resultado oficial do TSE do 1º turno. Situação do registro na Justiça
              Eleitoral: {registroFora}.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
