import { formatarPercentual, formatarVotos, type CandidatoResultado1Turno, type DisputaResultado1Turno } from "@/lib/resultados-1turno"
import { dividirVotosValidos, larguraBarra, type FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { Companheiros, FotoCandidato, NomeDoCandidato, ROTULO, SeloFase } from "@/components/Resultado1TurnoPartes"

type Tamanho = "grande" | "medio"

function Finalista({
  candidato,
  cargo,
  fotos,
  tamanho,
  lado,
}: {
  candidato: CandidatoResultado1Turno
  cargo: DisputaResultado1Turno["cargo"]
  fotos?: FotosCandidatos
  tamanho: Tamanho
  lado: "esquerda" | "direita"
}) {
  const grande = tamanho === "grande"
  const foto = grande ? "size-[72px] sm:size-28 lg:size-32" : "size-[72px] sm:size-24"
  const alinhamento =
    lado === "esquerda" ? "sm:flex-col sm:items-end sm:text-right" : "sm:flex-col sm:items-start sm:text-left"
  return (
    <div className={`flex min-w-0 items-center gap-4 ${alinhamento}`} data-pf-finalista-1turno={candidato.sq}>
      <FotoCandidato
        candidato={candidato}
        fotos={fotos}
        tamanho={grande ? 128 : 96}
        className={`${foto} ring-2 ring-[var(--gray-200)]`}
        initialsClassName="text-lg sm:text-2xl"
      />
      <div className="min-w-0 flex-1 sm:flex-none">
        <p
          className={`font-heading uppercase leading-[0.95] text-foreground [text-wrap:balance] ${grande ? "text-2xl sm:text-4xl" : "text-xl sm:text-3xl"}`}
        >
          <NomeDoCandidato candidato={candidato} cargo={cargo} className="" />
        </p>
        <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {candidato.partido} · nº {candidato.numero}
        </p>
        <p
          className={`mt-2 font-heading leading-none tabular-nums text-foreground ${grande ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"}`}
        >
          {formatarPercentual(candidato.percentual_validos)}
        </p>
        <p className="mt-1 text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground">
          {formatarVotos(candidato.votos)} votos
        </p>
      </div>
    </div>
  )
}

/** Barra empilhada dos votos válidos: finalista 1, demais candidatos, finalista 2; marca em 50%. */
function DivisaoVotos({ disputa }: { disputa: DisputaResultado1Turno }) {
  const { finalistas, demais } = dividirVotosValidos(disputa)
  const [a, b] = finalistas
  if (!a || !b) return null
  const pa = larguraBarra(a.percentual_validos)
  const pb = larguraBarra(b.percentual_validos)
  const resumo = `Votos válidos: ${a.nome_urna} ${formatarPercentual(a.percentual_validos)}, demais candidatos ${formatarPercentual(demais.percentual)}, ${b.nome_urna} ${formatarPercentual(b.percentual_validos)}. Ninguém passou de 50%.`
  return (
    // Topo todo branco (pedido de 05/10); o painel claro com borda separa a divisão dos votos como um gráfico à parte.
    <figure className="mt-8 rounded-[12px] border border-border bg-[var(--gray-50)] p-4 text-foreground sm:p-5" data-pf-divisao-votos>
      <div className="relative">
        <div
          role="img"
          aria-label={resumo}
          className="pf-barra pf-barra-entrada flex h-4 w-full overflow-hidden rounded-full bg-[var(--gray-100)] sm:h-5"
        >
          <span className="block h-full bg-[var(--gray-950)]" style={{ width: `${pa}%` }} />
          <span
            className="block h-full flex-1"
            style={{ backgroundImage: "repeating-linear-gradient(120deg, rgba(10,10,10,0.45) 0 1px, transparent 1px 6px)" }}
          />
          <span className="block h-full bg-[var(--gray-400)]" style={{ width: `${pb}%` }} />
        </div>
        <span aria-hidden="true" className="absolute -inset-y-1.5 left-1/2 w-px bg-[var(--gray-950)]" />
      </div>
      {/* No celular o resumo do meio desce para a última linha: os nomes nunca quebram no meio da palavra. */}
      <figcaption className="mt-2 grid grid-cols-2 items-start gap-x-3 gap-y-1 text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground sm:grid-cols-[1fr_auto_1fr]">
        <span className="min-w-0">
          <span className="block font-bold text-foreground">{a.nome_urna}</span> {formatarPercentual(a.percentual_validos)}
        </span>
        <span className="order-last col-span-2 text-center sm:order-none sm:col-span-1">
          50%
          <span className="block">
            {demais.candidatos === 1 ? "demais: 1 candidato" : `demais ${demais.candidatos} candidatos`}: {formatarPercentual(demais.percentual)}
          </span>
        </span>
        <span className="min-w-0 text-right">
          <span className="block font-bold text-foreground">{b.nome_urna}</span> {formatarPercentual(b.percentual_validos)}
        </span>
      </figcaption>
    </figure>
  )
}

/** Duelo do 2º turno no topo branco da página. `grande` na página do Brasil, `medio` na da UF. */
export function DueloSegundoTurno({
  disputa,
  fotos,
  tamanho = "grande",
}: {
  disputa: DisputaResultado1Turno
  fotos?: FotosCandidatos
  tamanho?: Tamanho
}) {
  const finalistas = disputa.candidatos.filter((c) => c.fase === "segundo_turno")
  if (finalistas.length !== 2) return null
  const [a, b] = finalistas
  return (
    <div data-pf-duelo-1turno={disputa.cargo}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-8">
        <Finalista candidato={a} cargo={disputa.cargo} fotos={fotos} tamanho={tamanho} lado="esquerda" />
        <p aria-hidden="true" className="flex items-center gap-3 font-heading text-2xl uppercase text-[var(--gray-400)] sm:block sm:text-5xl">
          <span className="h-px flex-1 bg-border sm:hidden" />x<span className="h-px flex-1 bg-border sm:hidden" />
        </p>
        <Finalista candidato={b} cargo={disputa.cargo} fotos={fotos} tamanho={tamanho} lado="direita" />
      </div>
      <p className="mt-6 text-center">
        <span className="inline-flex rounded-full bg-foreground px-3 py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.06em] text-background">
          Vão ao 2º turno em 25 de outubro
        </span>
      </p>
      <DivisaoVotos disputa={disputa} />
    </div>
  )
}

/** Eleito no 1º turno no topo branco da página: foto grande, selo, % e vice. */
export function VencedorDestaque({ disputa, fotos }: { disputa: DisputaResultado1Turno; fotos?: FotosCandidatos }) {
  const eleito = disputa.candidatos.find((c) => c.fase === "eleito")
  if (!eleito) return null
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8" data-pf-vencedor-1turno={disputa.cargo}>
      <FotoCandidato
        candidato={eleito}
        fotos={fotos}
        tamanho={128}
        className="size-24 ring-2 ring-[var(--gray-200)] sm:size-32"
        initialsClassName="text-2xl"
      />
      <div className="min-w-0">
        <SeloFase candidato={eleito} cargo={disputa.cargo} />
        <p className="mt-2 font-heading text-3xl uppercase leading-[0.95] text-foreground [text-wrap:balance] sm:text-5xl">
          <NomeDoCandidato candidato={eleito} cargo={disputa.cargo} className="" />
        </p>
        <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {eleito.partido} · nº {eleito.numero}
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-heading text-4xl leading-none tabular-nums text-foreground sm:text-6xl">
            {formatarPercentual(eleito.percentual_validos)}
          </span>
          <span className="text-[length:var(--text-body-sm)] font-medium tabular-nums text-muted-foreground">
            dos válidos · {formatarVotos(eleito.votos)} votos
          </span>
        </p>
        <Companheiros candidato={eleito} className="mt-2 text-foreground" />
      </div>
    </div>
  )
}

/** Os eleitos ao Senado lado a lado, sobre fundo claro. */
export function SenadoresEleitos({ disputa, fotos }: { disputa: DisputaResultado1Turno; fotos?: FotosCandidatos }) {
  const eleitos = disputa.candidatos.filter((c) => c.fase === "eleito")
  if (eleitos.length === 0) return null
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Eleitos ao Senado" data-pf-senadores-eleitos>
      {eleitos.map((c) => (
        <li key={c.sq} className="flex min-w-0 items-center gap-4 rounded-[12px] border border-border p-4">
          <FotoCandidato candidato={c} fotos={fotos} tamanho={64} className="size-16" initialsClassName="text-base" />
          <div className="min-w-0">
            <p className={`${ROTULO} text-muted-foreground`}>{c.posicao}º mais votado</p>
            <p className="mt-0.5 font-heading text-xl uppercase leading-tight text-foreground [text-wrap:balance]">
              <NomeDoCandidato candidato={c} cargo={disputa.cargo} className="" />
            </p>
            <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">{c.partido}</p>
            <p className="mt-1 tabular-nums">
              <span className="font-heading text-2xl leading-none">{formatarPercentual(c.percentual_validos)}</span>{" "}
              <span className="text-[length:var(--text-caption)] font-medium text-muted-foreground">
                {formatarVotos(c.votos)} votos
              </span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
