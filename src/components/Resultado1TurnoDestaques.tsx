import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { formatarPercentual, formatarVotos, type CandidatoResultado1Turno, type DisputaResultado1Turno } from "@/lib/resultados-1turno"
import { dividirVotosValidos, larguraBarra, type FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { coresDosFinalistas } from "@/lib/cores-finalistas"
import { Companheiros, FotoCandidato, NomeDoCandidato, ROTULO, SeloFase } from "@/components/Resultado1TurnoPartes"

type Tamanho = "grande" | "medio"
/** `escuro` é o hero preto da home: texto branco sobre a imagem do dossiê. */
type Tom = "claro" | "escuro"

function Finalista({
  candidato,
  cargo,
  fotos,
  tamanho,
  lado,
  tom,
}: {
  candidato: CandidatoResultado1Turno
  cargo: DisputaResultado1Turno["cargo"]
  fotos?: FotosCandidatos
  tamanho: Tamanho
  lado: "esquerda" | "direita"
  tom: Tom
}) {
  const grande = tamanho === "grande"
  const escuro = tom === "escuro"
  const texto = escuro ? "text-white" : "text-foreground"
  const apoio = escuro ? "text-white/80" : "text-muted-foreground"
  const alinhamento =
    lado === "esquerda" ? "sm:flex-col sm:items-end sm:text-right" : "sm:flex-col sm:items-start sm:text-left"
  if (escuro) {
    // Hero da home. No celular cada finalista é uma linha compacta: foto menor, nome e % na mesma
    // linha, sem a contagem de votos. Do sm em diante, o duelo grande de sempre, com foto, nome e %
    // escalando também pela altura da tela (vh): do título ao "Comparar lado a lado" cabe numa tela só.
    return (
      <div className={`flex min-w-0 items-center gap-3 sm:gap-[clamp(6px,1.2vh,16px)] ${alinhamento}`} data-pf-finalista-1turno={candidato.sq}>
        <FotoCandidato
          candidato={candidato}
          fotos={fotos}
          tamanho={grande ? 128 : 96}
          className={`${grande ? "size-14 sm:size-[clamp(56px,9vh,128px)]" : "size-14 sm:size-24"} ring-2 ring-white/30`}
          initialsClassName="text-base sm:text-2xl"
        />
        {/* Celular: grade de 3 colunas (nome e % na 1ª linha; partido e link na 2ª). Do sm em diante, coluna com `order`.
            A ordem do DOM é a de leitura: nome, partido, %, votos, link. */}
        <div className={`grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 sm:flex sm:flex-none sm:flex-col ${lado === "esquerda" ? "sm:items-end" : "sm:items-start"}`}>
          <p className={`col-span-2 col-start-1 row-start-1 min-w-0 font-heading uppercase leading-[0.95] text-white [text-wrap:balance] sm:order-1 ${grande ? "text-xl sm:text-[clamp(1.375rem,3.6vh,2.25rem)]" : "text-lg sm:text-3xl"}`}>
            <NomeDoCandidato candidato={candidato} cargo={cargo} className="" />
          </p>
          <p className="col-start-1 row-start-2 whitespace-nowrap text-[length:var(--text-caption)] font-medium text-white/80 sm:order-2 sm:mt-1">
            {candidato.partido} · nº {candidato.numero}
          </p>
          <p
            className={`col-start-3 row-start-1 self-center font-heading leading-none tabular-nums text-white sm:order-3 sm:mt-1 ${grande ? "text-3xl sm:text-[clamp(2.25rem,6vh,3.75rem)]" : "text-2xl sm:text-5xl"}`}
          >
            {formatarPercentual(candidato.percentual_validos)}
          </p>
          <p className="hidden text-[length:var(--text-caption)] font-medium tabular-nums text-white/80 sm:order-4 sm:mt-1 sm:block">
            {formatarVotos(candidato.votos)} votos
          </p>
          {/* No hero a ficha é o próximo clique natural; na página de resultado, a lista abaixo já linka. */}
          {candidato.slug && (
            <Link
              href={`/candidato/${candidato.slug}`}
              aria-label={`Ficha completa de ${candidato.nome_urna}`}
              className="col-span-2 col-start-2 row-start-2 inline-flex min-h-11 items-center gap-1 justify-self-start whitespace-nowrap text-[length:var(--text-body-sm)] font-bold text-white underline underline-offset-4 hover:text-white/80 sm:order-5"
            >
              Ficha completa <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    )
  }
  const foto = grande ? "size-[72px] sm:size-28 lg:size-32" : "size-[72px] sm:size-24"
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
          className={`font-heading uppercase leading-[0.95] ${texto} [text-wrap:balance] ${grande ? "text-2xl sm:text-4xl" : "text-xl sm:text-3xl"}`}
        >
          <NomeDoCandidato candidato={candidato} cargo={cargo} className="" />
        </p>
        <p className={`mt-1 text-[length:var(--text-caption)] font-medium ${apoio}`}>
          {candidato.partido} · nº {candidato.numero}
        </p>
        <p
          className={`mt-2 font-heading leading-none tabular-nums ${texto} ${grande ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"}`}
        >
          {formatarPercentual(candidato.percentual_validos)}
        </p>
        <p className={`mt-1 text-[length:var(--text-caption)] font-medium tabular-nums ${apoio}`}>
          {formatarVotos(candidato.votos)} votos
        </p>
      </div>
    </div>
  )
}

/**
 * No hero (tom escuro), cada finalista ganha a cor do lado do partido, a mesma régua da seção
 * de espectro. Só quando os dois têm classe e classes diferentes; senão fica branco e cinza.
 */
function coresEspectro(a: CandidatoResultado1Turno, b: CandidatoResultado1Turno) {
  return coresDosFinalistas(a.partido, b.partido)
}

function Amostra({ cor, lado }: { cor: string; lado: "esquerda" | "direita" }) {
  return <span aria-hidden="true" className={`${lado === "esquerda" ? "mr-1.5" : "ml-1.5"} inline-block size-2.5 rounded-[2px] align-baseline ring-1 ring-white/60`} style={{ background: cor }} />
}

export function DivisaoVotos({ disputa, tom = "claro" }: { disputa: DisputaResultado1Turno; tom?: Tom }) {
  const escuro = tom === "escuro"
  const { finalistas, demais } = dividirVotosValidos(disputa)
  const [a, b] = finalistas
  if (!a || !b) return null
  const pa = larguraBarra(a.percentual_validos)
  const pb = larguraBarra(b.percentual_validos)
  const espectro = escuro ? coresEspectro(a, b) : null
  const resumo = `Votos válidos: ${a.nome_urna} ${formatarPercentual(a.percentual_validos)}, demais candidatos ${formatarPercentual(demais.percentual)}, ${b.nome_urna} ${formatarPercentual(b.percentual_validos)}. Ninguém passou de 50%.`
  return (
    // Claro: painel com borda no topo branco (pedido de 05/10). Escuro: direto sobre o hero preto, sem painel.
    <figure
      className={escuro ? "mt-4 text-white sm:mt-[clamp(14px,2.5vh,32px)]" : "mt-8 rounded-[12px] border border-border bg-[var(--gray-50)] p-4 text-foreground sm:p-5"}
      data-pf-divisao-votos={tom}
    >
      <div className="relative">
        <div
          role="img"
          aria-label={resumo}
          className={`pf-barra pf-barra-entrada flex h-4 w-full overflow-hidden rounded-full sm:h-5 ${escuro ? "bg-white/15" : "bg-[var(--gray-100)]"}`}
        >
          <span
            className={`block h-full ${espectro ? "" : escuro ? "bg-white" : "bg-[var(--gray-950)]"}`}
            style={{ width: `${pa}%`, ...(espectro ? { background: espectro.a.cor } : {}) }}
          />
          <span
            className="block h-full flex-1"
            style={{
              backgroundImage: escuro
                ? "repeating-linear-gradient(120deg, rgba(255,255,255,0.55) 0 1px, transparent 1px 6px)"
                : "repeating-linear-gradient(120deg, rgba(10,10,10,0.45) 0 1px, transparent 1px 6px)",
            }}
          />
          <span
            className={`block h-full ${espectro ? "" : "bg-[var(--gray-400)]"}`}
            style={{ width: `${pb}%`, ...(espectro ? { background: espectro.b.cor } : {}) }}
          />
        </div>
        <span aria-hidden="true" className={`absolute -inset-y-1.5 left-1/2 w-px ${escuro ? "bg-white" : "bg-[var(--gray-950)]"}`} />
      </div>
      {/* No celular o resumo do meio desce para a última linha: os nomes nunca quebram no meio da palavra. */}
      <figcaption
        className={`mt-2 grid grid-cols-2 items-start gap-x-3 gap-y-1 text-[length:var(--text-caption)] font-medium tabular-nums sm:grid-cols-[1fr_auto_1fr] ${escuro ? "text-white/80" : "text-muted-foreground"}`}
      >
        <span className="min-w-0">
          <span className={`block font-bold ${escuro ? "text-white" : "text-foreground"}`}>
            {espectro && <Amostra cor={espectro.a.cor} lado="esquerda" />}
            {a.nome_urna}
          </span>{" "}
          {formatarPercentual(a.percentual_validos)}
          {espectro && <span className="block">{espectro.a.rotulo}</span>}
        </span>
        <span className="order-last col-span-2 text-center sm:order-none sm:col-span-1">
          50%
          <span className="block">
            {demais.candidatos === 1 ? "demais: 1 candidato" : `demais ${demais.candidatos} candidatos`}: {formatarPercentual(demais.percentual)}
          </span>
        </span>
        <span className="min-w-0 text-right">
          <span className={`block font-bold ${escuro ? "text-white" : "text-foreground"}`}>
            {b.nome_urna}
            {espectro && <Amostra cor={espectro.b.cor} lado="direita" />}
          </span>{" "}
          {formatarPercentual(b.percentual_validos)}
          {espectro && <span className="block">{espectro.b.rotulo}</span>}
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
  tom = "claro",
  selo = true,
}: {
  disputa: DisputaResultado1Turno
  fotos?: FotosCandidatos
  tamanho?: Tamanho
  tom?: Tom
  /** O selo "Vão ao 2º turno" sai no hero, que já mostra a data e a contagem. */
  selo?: boolean
}) {
  const finalistas = disputa.candidatos.filter((c) => c.fase === "segundo_turno")
  if (finalistas.length !== 2) return null
  const [a, b] = finalistas
  return (
    <div data-pf-duelo-1turno={disputa.cargo}>
      <div className={`grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-8 ${tom === "escuro" ? "gap-2" : "gap-4"}`}>
        <Finalista candidato={a} cargo={disputa.cargo} fotos={fotos} tamanho={tamanho} lado="esquerda" tom={tom} />
        <p
          aria-hidden="true"
          className={`flex items-center gap-3 font-heading uppercase sm:block sm:text-5xl ${tom === "escuro" ? "text-base text-white/70" : "text-2xl text-[var(--gray-400)]"}`}
        >
          <span className={`h-px flex-1 sm:hidden ${tom === "escuro" ? "bg-white/30" : "bg-border"}`} />x
          <span className={`h-px flex-1 sm:hidden ${tom === "escuro" ? "bg-white/30" : "bg-border"}`} />
        </p>
        <Finalista candidato={b} cargo={disputa.cargo} fotos={fotos} tamanho={tamanho} lado="direita" tom={tom} />
      </div>
      {selo && (
        <p className="mt-6 text-center">
          <span className="inline-flex rounded-full bg-foreground px-3 py-1 text-[length:var(--text-caption)] font-bold uppercase tracking-[0.06em] text-background">
            Vão ao 2º turno em 25 de outubro
          </span>
        </p>
      )}
      <DivisaoVotos disputa={disputa} tom={tom} />
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
