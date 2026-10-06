import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getEstadoNome } from "@/lib/br-uf"
import {
  formatarPercentual,
  getDisputa1Turno,
  href1Turno,
  type CandidatoResultado1Turno,
  type DisputaResultado1Turno,
  type Resultados1Turno,
} from "@/lib/resultados-1turno"
import type { FotosCandidatos } from "@/lib/resultados-1turno-vista"
import { FotoCandidato, NomeDoCandidato, ROTULO } from "@/components/Resultado1TurnoPartes"

interface EstadoResumo {
  uf: string
  nome: string
  governador: DisputaResultado1Turno | null
  senado: DisputaResultado1Turno | null
}

function SubTitulo({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h3 id={id} className="font-heading text-2xl uppercase leading-tight text-foreground [text-wrap:balance] sm:text-3xl">
      {children}
    </h3>
  )
}

function LinkEstado({ estado, className = "" }: { estado: EstadoResumo; className?: string }) {
  return (
    <Link
      href={href1Turno(estado.uf)}
      aria-label={`Ver todos os candidatos e votos em ${estado.nome}`}
      className={`inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[length:var(--text-body-sm)] font-bold underline underline-offset-4 ${className}`.trim()}
    >
      Ver estado <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

function CandidatoCompacto({
  candidato,
  cargo,
  fotos,
  alinhar = "esquerda",
}: {
  candidato: CandidatoResultado1Turno
  cargo: DisputaResultado1Turno["cargo"]
  fotos?: FotosCandidatos
  alinhar?: "esquerda" | "direita"
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${alinhar === "direita" ? "sm:flex-row-reverse sm:text-right" : ""}`.trim()}>
      <FotoCandidato candidato={candidato} fotos={fotos} tamanho={48} className="size-11 sm:size-12" />
      <div className="min-w-0">
        <p className="break-words text-[length:var(--text-body-sm)] leading-tight">
          <NomeDoCandidato candidato={candidato} cargo={cargo} />
        </p>
        <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">{candidato.partido}</p>
        <p className="font-bold tabular-nums">{formatarPercentual(candidato.percentual_validos)}</p>
      </div>
    </div>
  )
}

function DueloEstado({ estado, fotos }: { estado: EstadoResumo; fotos?: FotosCandidatos }) {
  const disputa = estado.governador!
  const [a, b] = disputa.candidatos.filter((c) => c.fase === "segundo_turno")
  return (
    <li
      data-pf-uf-1turno={estado.uf.toLowerCase()}
      className="grid gap-3 border-t border-border py-4 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-center md:gap-6"
    >
      <p className="font-heading text-xl uppercase leading-tight text-foreground">
        {estado.nome}
        <span className="sr-only">: 2º turno para governador entre {a.nome_urna} e {b?.nome_urna}</span>
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <CandidatoCompacto candidato={a} cargo={disputa.cargo} fotos={fotos} />
        <span aria-hidden="true" className="font-heading text-lg uppercase text-muted-foreground">
          x
        </span>
        {b && <CandidatoCompacto candidato={b} cargo={disputa.cargo} fotos={fotos} alinhar="direita" />}
      </div>
      <LinkEstado estado={estado} />
    </li>
  )
}

function EleitoEstado({ estado, fotos }: { estado: EstadoResumo; fotos?: FotosCandidatos }) {
  const disputa = estado.governador!
  const eleito = disputa.candidatos.find((c) => c.fase === "eleito")!
  return (
    <li data-pf-uf-1turno={estado.uf.toLowerCase()} className="flex min-w-0 items-center gap-3 border-t border-border py-3">
      <FotoCandidato candidato={eleito} fotos={fotos} tamanho={40} className="size-10" />
      <div className="min-w-0 flex-1">
        <Link
          href={href1Turno(estado.uf)}
          aria-label={`Ver todos os candidatos e votos em ${estado.nome}`}
          className={`${ROTULO} text-muted-foreground underline-offset-2 hover:text-foreground hover:underline`}
        >
          {estado.nome}
        </Link>
        <p className="break-words text-[length:var(--text-body-sm)] leading-tight">
          <span className="sr-only">Eleito: </span>
          <NomeDoCandidato candidato={eleito} cargo={disputa.cargo} />
        </p>
        <p className="text-[length:var(--text-caption)] font-medium text-muted-foreground">{eleito.partido}</p>
      </div>
      <p className="shrink-0 font-heading text-xl leading-none tabular-nums text-foreground">
        {formatarPercentual(eleito.percentual_validos)}
      </p>
    </li>
  )
}

function SemDadoEstado({ estado }: { estado: EstadoResumo }) {
  return (
    <li data-pf-uf-1turno={estado.uf.toLowerCase()} className="flex items-center justify-between gap-3 border-t border-border py-3">
      <p className="min-w-0">
        <span className="font-bold">{estado.nome}</span>{" "}
        <span className="text-[length:var(--text-caption)] text-muted-foreground">Sem definição de Governador no arquivo do TSE.</span>
      </p>
      <LinkEstado estado={estado} />
    </li>
  )
}

function SenadoEstado({ estado, fotos }: { estado: EstadoResumo; fotos?: FotosCandidatos }) {
  const disputa = estado.senado
  const eleitos = disputa ? disputa.candidatos.filter((c) => c.fase === "eleito") : []
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 border-t border-border py-3" data-pf-senado-uf={estado.uf.toLowerCase()}>
      <Link
        href={href1Turno(estado.uf)}
        aria-label={`Senado em ${estado.nome}: ver todos os candidatos`}
        className="pt-1 font-heading text-xl uppercase leading-none text-foreground underline-offset-4 hover:underline"
      >
        {estado.uf.toUpperCase()}
      </Link>
      {eleitos.length === 0 || !disputa ? (
        <p className="text-[length:var(--text-caption)] text-muted-foreground">Nenhum eleito no resultado do TSE.</p>
      ) : (
        // Uma coluna quando a célula do estado é estreita (celular e md): partido e % não quebram no meio da palavra.
        <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2" aria-label={`Eleitos ao Senado em ${estado.nome}`}>
          {eleitos.map((c) => (
            <li key={c.sq} className="flex min-w-0 items-center gap-2">
              <FotoCandidato candidato={c} fotos={fotos} tamanho={32} className="size-8" initialsClassName="text-[length:var(--text-eyebrow)]" />
              <div className="min-w-0">
                <p className="break-words text-[length:var(--text-caption)] leading-tight">
                  <NomeDoCandidato candidato={c} cargo={disputa.cargo} />
                </p>
                <p className="text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground">
                  {c.partido} · {formatarPercentual(c.percentual_validos)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export type BlocoEstados1Turno = "segundo-turno" | "eleitos" | "sem-dado" | "senado"

const TODOS_OS_BLOCOS: readonly BlocoEstados1Turno[] = ["segundo-turno", "eleitos", "sem-dado", "senado"]

/**
 * Governador e Senado por estado: 2º turno, eleitos no 1º turno e senadores
 * eleitos. `blocos` escolhe o que entra; a home já mostra os duelos estaduais em
 * outro componente e divide Governador e Senado em seções próprias.
 */
export function Resultado1TurnoEstados({
  ufs,
  data,
  fotos,
  blocos = TODOS_OS_BLOCOS,
}: {
  ufs: string[]
  data: Resultados1Turno
  fotos?: FotosCandidatos
  blocos?: readonly BlocoEstados1Turno[]
}) {
  const estados: EstadoResumo[] = ufs
    .map((uf) => ({
      uf,
      nome: getEstadoNome(uf) ?? uf.toUpperCase(),
      governador: getDisputa1Turno("Governador", uf, data),
      senado: getDisputa1Turno("Senador", uf, data),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const segundoTurno = estados.filter((e) => e.governador?.candidatos.filter((c) => c.fase === "segundo_turno").length === 2)
  const eleitos = estados.filter((e) => e.governador?.candidatos.some((c) => c.fase === "eleito"))
  const semDado = estados.filter((e) => !segundoTurno.includes(e) && !eleitos.includes(e))

  return (
    <div className="space-y-12">
      {blocos.includes("segundo-turno") && segundoTurno.length > 0 && (
        <section aria-labelledby="estados-2turno">
          <SubTitulo id="estados-2turno">2º turno para governador</SubTitulo>
          <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            {segundoTurno.length} {segundoTurno.length === 1 ? "estado volta" : "estados voltam"} às urnas em 25 de outubro.
          </p>
          <ul className="mt-4 border-b border-border">
            {segundoTurno.map((e) => (
              <DueloEstado key={e.uf} estado={e} fotos={fotos} />
            ))}
          </ul>
        </section>
      )}

      {blocos.includes("eleitos") && eleitos.length > 0 && (
        <section aria-labelledby="estados-eleitos">
          <SubTitulo id="estados-eleitos">Governador eleito no 1º turno</SubTitulo>
          <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            {eleitos.length} {eleitos.length === 1 ? "estado" : "estados"}, com a % dos votos válidos do eleito.
          </p>
          <ul className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {eleitos.map((e) => (
              <EleitoEstado key={e.uf} estado={e} fotos={fotos} />
            ))}
          </ul>
        </section>
      )}

      {blocos.includes("sem-dado") && semDado.length > 0 && (
        <section aria-labelledby="estados-sem-dado">
          <SubTitulo id="estados-sem-dado">Sem definição no arquivo do TSE</SubTitulo>
          <ul className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {semDado.map((e) => (
              <SemDadoEstado key={e.uf} estado={e} />
            ))}
          </ul>
        </section>
      )}

      {blocos.includes("senado") && (
        <section aria-labelledby="estados-senado">
          <SubTitulo id="estados-senado">Senado: eleitos por estado</SubTitulo>
          <p className="mt-1 text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            Duas vagas por estado, decididas no 1º turno.
          </p>
          <ul className="mt-4 grid gap-x-8 border-b border-border md:grid-cols-2 xl:grid-cols-3">
            {estados.map((e) => (
              <SenadoEstado key={e.uf} estado={e} fotos={fotos} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
