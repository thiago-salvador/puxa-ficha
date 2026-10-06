import type { CSSProperties } from "react"
import Link from "next/link"
import {
  formatarPercentual,
  formatarVotos,
  rotuloCompanheiro1Turno,
  rotuloFase1Turno,
  type CandidatoResultado1Turno,
  type DisputaResultado1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import { agruparResultado, fotoDe, larguraBarra, type FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { shouldExposeCargo } from "@/lib/senado-feature"
import { safeHref } from "@/lib/utils"
import { CandidatePhoto } from "@/components/CandidatePhoto"

const MENSAGEM_SEM_TOTALIZACAO =
  "O TSE ainda não concluiu a totalização. O resultado oficial aparece aqui assim que a apuração terminar."

const MENSAGEM_PREVIA = "Prévia local: apuração em andamento, números parciais"

export const ROTULO = "text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.1em]"

export function ResultadoVazio({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      data-pf-resultado-1turno="vazio"
      className={`rounded-[12px] border border-border bg-secondary px-5 py-8 text-center ${className}`.trim()}
    >
      <p className="mx-auto max-w-prose text-[length:var(--text-body)] font-semibold text-foreground">
        {MENSAGEM_SEM_TOTALIZACAO}
      </p>
    </div>
  )
}

export function ResultadoPreviaBanner({ data }: { data: Resultados1Turno }) {
  if (data.status !== "previa") return null
  return (
    <p
      role="status"
      data-pf-resultado-1turno="previa"
      className="rounded-[8px] border border-foreground bg-secondary px-4 py-3 text-[length:var(--text-body-sm)] font-bold text-foreground"
    >
      {MENSAGEM_PREVIA}
    </p>
  )
}

/** Linha de fonte: o resultado vem do arquivo oficial do TSE, com o horário de geração dele. */
export function ResultadoFonte({ disputa, className = "" }: { disputa: DisputaResultado1Turno; className?: string }) {
  const href = safeHref(disputa.fonte.url)
  return (
    <p className={`max-w-prose text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground ${className}`.trim()}>
      Fonte: TSE, resultado oficial
      {href && (
        <>
          {" "}
          (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
            aria-label="Arquivo de dados do TSE (abre em nova aba)"
          >
            arquivo de dados
          </a>
          )
        </>
      )}
      . Gerado pelo TSE em {disputa.fonte.gerado_tse}.
      {!disputa.fechamento_oficial && (
        <>
          {" "}
          100% das seções totalizadas; o TSE ainda não publicou o fechamento oficial desta disputa
          {disputa.fase_calculada ? ", e a situação de cada candidato foi calculada pelos votos" : ""}.
        </>
      )}
    </p>
  )
}

/** Selo de situação: preto para eleito e 2º turno, contorno para os demais. */
export function SeloFase({
  candidato,
  cargo,
  tema = "claro",
}: {
  candidato: Pick<CandidatoResultado1Turno, "fase">
  cargo: DisputaResultado1Turno["cargo"]
  tema?: "claro" | "escuro"
}) {
  const destaque = candidato.fase === "eleito" || candidato.fase === "segundo_turno"
  const cores = destaque
    ? tema === "escuro"
      ? "border-white bg-white text-black"
      : "border-foreground bg-foreground text-background"
    : tema === "escuro"
      ? "border-white/40 text-white"
      : "border-foreground/30 bg-background text-foreground"
  return (
    <span
      data-pf-fase-1turno={candidato.fase}
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[length:var(--text-eyebrow)] font-bold uppercase leading-tight tracking-[0.06em] ${cores}`}
    >
      {rotuloFase1Turno(candidato.fase, cargo)}
    </span>
  )
}

export function NomeDoCandidato({
  candidato,
  cargo,
  className = "font-bold",
}: {
  candidato: Pick<CandidatoResultado1Turno, "nome_urna" | "slug">
  cargo: DisputaResultado1Turno["cargo"]
  className?: string
}) {
  // Ficha de senador só existe com o Senado ligado; sem isso, nome sem link (nunca link para 404).
  if (candidato.slug && shouldExposeCargo(cargo)) {
    return (
      <Link
        href={`/candidato/${candidato.slug}`}
        className={`${className} underline-offset-4 hover:underline focus-visible:underline`.trim()}
      >
        {candidato.nome_urna}
      </Link>
    )
  }
  return <span className={className}>{candidato.nome_urna}</span>
}

/** Foto redonda da ficha; sem foto (ou com falha) mostra as iniciais. */
export function FotoCandidato({
  candidato,
  fotos,
  tamanho,
  className = "",
  initialsClassName = "text-xs",
}: {
  candidato: Pick<CandidatoResultado1Turno, "nome_urna" | "slug">
  fotos?: FotosCandidatos
  tamanho: number
  className?: string
  initialsClassName?: string
}) {
  return (
    <CandidatePhoto
      src={fotoDe(fotos, candidato.slug)}
      alt=""
      name={candidato.nome_urna}
      width={tamanho}
      height={tamanho}
      sizes={`${tamanho}px`}
      initialsClassName={initialsClassName}
      className={`shrink-0 rounded-full bg-secondary object-cover object-top ${className}`.trim()}
    />
  )
}

export function Companheiros({ candidato, className = "" }: { candidato: CandidatoResultado1Turno; className?: string }) {
  if (candidato.companheiros.length === 0) return null
  return (
    <ul className={`text-[length:var(--text-caption)] leading-snug text-foreground ${className}`.trim()}>
      {candidato.companheiros.map((c) => (
        <li key={`${c.tipo}-${c.nome}`}>
          <span className="text-muted-foreground">{rotuloCompanheiro1Turno(c.tipo)}:</span> {c.nome}
          {c.partido ? ` (${c.partido})` : ""}
        </li>
      ))}
    </ul>
  )
}

const GRADE_LINHA =
  "grid grid-cols-[1.75rem_2.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-t border-border py-3 sm:grid-cols-[2rem_2.5rem_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:gap-x-4"

function BarraVotos({ candidato, destaque, maioria }: { candidato: CandidatoResultado1Turno; destaque: boolean; maioria: boolean }) {
  return (
    <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
      <span
        className={`pf-barra block h-full rounded-full ${destaque ? "bg-foreground" : "bg-[var(--gray-300)]"}`}
        style={{ width: `${larguraBarra(candidato.percentual_validos)}%` }}
      />
      {maioria && <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/50" />}
    </div>
  )
}

function LinhaCandidato({
  candidato,
  cargo,
  fotos,
  indice,
  maioria,
}: {
  candidato: CandidatoResultado1Turno
  cargo: DisputaResultado1Turno["cargo"]
  fotos?: FotosCandidatos
  indice: number
  maioria: boolean
}) {
  const destaque = candidato.fase === "eleito" || candidato.fase === "segundo_turno"
  const mostrarSelo = candidato.fase !== "nao_eleito"
  return (
    <li
      className={GRADE_LINHA}
      data-pf-candidato-1turno={candidato.fase}
      style={{ "--pf-i": Math.min(indice, 11) } as CSSProperties}
    >
      <span className="pt-2 font-heading text-lg leading-none tabular-nums text-foreground sm:pt-0">
        {candidato.posicao}º
      </span>
      <FotoCandidato candidato={candidato} fotos={fotos} tamanho={40} className="size-9 sm:size-10" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <NomeDoCandidato candidato={candidato} cargo={cargo} className="break-words font-bold" />
          {mostrarSelo && <SeloFase candidato={candidato} cargo={cargo} />}
        </div>
        <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {candidato.partido} · nº {candidato.numero}
        </p>
        <Companheiros candidato={candidato} className="mt-0.5" />
      </div>
      <div className="col-start-3 min-w-0 sm:col-start-auto">
        <p className="flex items-baseline justify-between gap-3 tabular-nums">
          <span className={`font-bold text-foreground ${destaque ? "text-[length:var(--text-body-lg)]" : ""}`.trim()}>
            {formatarPercentual(candidato.percentual_validos)}
          </span>
          <span className="whitespace-nowrap text-[length:var(--text-caption)] font-medium text-muted-foreground">
            {formatarVotos(candidato.votos)} votos
          </span>
        </p>
        <BarraVotos candidato={candidato} destaque={destaque} maioria={maioria} />
      </div>
    </li>
  )
}

function LinhaAnulado({
  candidato,
  cargo,
  fotos,
}: {
  candidato: CandidatoResultado1Turno
  cargo: DisputaResultado1Turno["cargo"]
  fotos?: FotosCandidatos
}) {
  return (
    <li className={GRADE_LINHA} data-pf-candidato-1turno={candidato.fase}>
      <span className="pt-2 text-muted-foreground sm:pt-0">
        <span className="sr-only">Sem posição: voto não válido</span>
      </span>
      <FotoCandidato candidato={candidato} fotos={fotos} tamanho={40} className="size-9 opacity-70 sm:size-10" />
      <div className="min-w-0">
        <NomeDoCandidato candidato={candidato} cargo={cargo} className="break-words font-bold" />
        <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {candidato.partido} · nº {candidato.numero}
        </p>
        <Companheiros candidato={candidato} className="mt-0.5" />
      </div>
      <div className="col-start-3 min-w-0 sm:col-start-auto">
        <p className="text-[length:var(--text-caption)] font-medium leading-snug text-muted-foreground">
          <span className="font-bold text-foreground">{candidato.destinacao}</span>: voto não entra nos válidos ·{" "}
          <span className="whitespace-nowrap tabular-nums">{formatarVotos(candidato.votos)} votos</span>
        </p>
        <div className="mt-1.5 h-2 rounded-full border border-dashed border-[var(--gray-400)]" aria-hidden="true" />
      </div>
    </li>
  )
}

function RotuloGrupo({ children }: { children: React.ReactNode }) {
  return (
    <p aria-hidden="true" className={`${ROTULO} mt-6 pb-2 text-muted-foreground`}>
      {children}
    </p>
  )
}

/**
 * Lista do resultado de uma disputa: eleitos ou finalistas primeiro, depois os
 * demais com voto válido e, no fim, os votos não válidos. Barra em escala fixa
 * de 0 a 100% dos válidos.
 */
export function ResultadoLinhas({
  disputa,
  legenda,
  fotos,
}: {
  disputa: DisputaResultado1Turno
  legenda: string
  fotos?: FotosCandidatos
}) {
  const { destaque, demais, anulados } = agruparResultado(disputa)
  // Marca de 50% só onde maioria absoluta decide no 1º turno (Presidente e Governador).
  const maioria = disputa.cargo !== "Senador"
  const rotuloDemais = demais.every((c) => c.fase === "nao_eleito") ? "Não eleitos" : "Demais candidatos"
  return (
    <div data-pf-resultado-lista data-pf-revelar="auto">
      <p className="mb-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        <span>Em ordem de votos</span>
        <span>
          Barra: % dos votos válidos, de 0 a 100%{maioria ? "; a linha marca 50%" : ""}
        </span>
      </p>
      {destaque.length > 0 && (
        <ol aria-label={`${legenda}: ${destaque[0].fase === "segundo_turno" ? "vão ao 2º turno" : "eleitos"}`}>
          {destaque.map((c, i) => (
            <LinhaCandidato key={c.sq} candidato={c} cargo={disputa.cargo} fotos={fotos} indice={i} maioria={maioria} />
          ))}
        </ol>
      )}
      {demais.length > 0 && (
        <>
          {destaque.length > 0 && <RotuloGrupo>{rotuloDemais}</RotuloGrupo>}
          <ol
            start={destaque.length + 1}
            aria-label={destaque.length > 0 ? `${legenda}: ${rotuloDemais.toLowerCase()}` : legenda}
            className="border-b border-border"
          >
            {demais.map((c, i) => (
              <LinhaCandidato
                key={c.sq}
                candidato={c}
                cargo={disputa.cargo}
                fotos={fotos}
                indice={destaque.length + i}
                maioria={maioria}
              />
            ))}
          </ol>
        </>
      )}
      {anulados.length > 0 && (
        <>
          <RotuloGrupo>Votos não válidos</RotuloGrupo>
          <ul aria-label={`${legenda}: votos não válidos`} className="border-b border-border">
            {anulados.map((c) => (
              <LinhaAnulado key={c.sq} candidato={c} cargo={disputa.cargo} fotos={fotos} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ItemTotal({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="min-w-0 lg:px-5 lg:first:pl-0">
      <dt className={`${ROTULO} text-muted-foreground`}>{rotulo}</dt>
      <dd className="mt-1 text-[length:var(--text-body-lg)] font-bold tabular-nums text-foreground">{valor}</dd>
      {detalhe && <dd className="text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground">{detalhe}</dd>}
    </div>
  )
}

export function ResultadoTotais({ disputa, className = "" }: { disputa: DisputaResultado1Turno; className?: string }) {
  const t = disputa.totais
  return (
    <dl
      data-pf-totais-1turno
      // Grade fixa até lg (2 e 3 colunas); só em lg vira uma linha com divisórias, sem item órfão quebrado.
      className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0 lg:divide-x lg:divide-border ${className}`.trim()}
    >
      <ItemTotal
        rotulo="Comparecimento"
        valor={formatarPercentual(t.percentual_comparecimento)}
        detalhe={`${formatarVotos(t.comparecimento)} eleitores`}
      />
      <ItemTotal
        rotulo="Abstenção"
        valor={formatarPercentual(t.percentual_abstencao)}
        detalhe={`${formatarVotos(t.abstencao)} eleitores`}
      />
      <ItemTotal rotulo="Votos válidos" valor={formatarVotos(t.votos_validos)} />
      <ItemTotal rotulo="Brancos" valor={formatarPercentual(t.percentual_brancos)} detalhe={`${formatarVotos(t.brancos)} votos`} />
      <ItemTotal rotulo="Nulos" valor={formatarPercentual(t.percentual_nulos)} detalhe={`${formatarVotos(t.nulos)} votos`} />
      <ItemTotal
        rotulo="Seções totalizadas"
        valor={formatarVotos(t.secoes_totalizadas)}
        detalhe={t.secoes === null ? undefined : `de ${formatarVotos(t.secoes)}`}
      />
    </dl>
  )
}

export function TituloSecao({ titulo, id, children }: { titulo: string; id?: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2
        id={id}
        className="font-heading uppercase leading-[0.95] text-foreground [text-wrap:balance]"
        style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
      >
        {titulo}
      </h2>
      {children && (
        <div className="mt-3 max-w-prose text-[length:var(--text-body)] font-medium text-muted-foreground">{children}</div>
      )}
    </div>
  )
}
