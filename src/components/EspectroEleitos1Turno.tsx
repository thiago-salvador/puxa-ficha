import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { contarEspectroEleitos, rotuloClasseEspectro, type EspectroEleitos, type LinhaEspectro } from "@/lib/espectro-eleitos"
import { getResultados1Turno, hasResultados1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { SlashDivider } from "@/components/SlashDivider"
import { TituloSecao } from "@/components/Resultado1TurnoPartes"
import {
  Amostra,
  ArcoSenado,
  BarraComNumeros,
  contagens,
  Hemiciclo,
  LegendaEspectro,
  rotuloGrafico,
  TabelaGovernadores,
  TituloBloco,
  type ClasseGrafico,
} from "@/components/EspectroGraficos"

const NUMERO = new Intl.NumberFormat("pt-BR")

function PorPartido({ espectro }: { espectro: EspectroEleitos }) {
  return (
    <details className="group rounded-[12px] border border-border px-4 py-3" data-pf-espectro-partidos>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[length:var(--text-body-sm)] font-bold">
        Por partido
        <span aria-hidden="true" className="text-muted-foreground transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)] group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="mt-3 space-y-5">
        {espectro.linhas.map((l) => (
          <section key={l.cargo} aria-label={`${l.cargo}, eleitos por partido`}>
            <h3 className="font-heading text-lg uppercase leading-tight">{l.cargo}</h3>
            {l.partidos.length === 0 ? (
              <p className="mt-1 text-[length:var(--text-body-sm)] text-muted-foreground">Nenhum eleito até agora.</p>
            ) : (
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-[length:var(--text-body-sm)] sm:grid-cols-2">
                {l.partidos.map((p) => (
                  <li key={p.sigla} className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-1">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Amostra classe={p.classe} />
                      <span className="font-bold">{p.sigla}</span>{" "}
                      <span className="text-muted-foreground">({rotuloClasseEspectro(p.classe).toLowerCase()})</span>
                    </span>
                    <span className="font-bold tabular-nums">{NUMERO.format(p.eleitos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </details>
  )
}

function Metodologia({ espectro }: { espectro: EspectroEleitos }) {
  const m = espectro.metodologia
  return (
    <details className="group rounded-[12px] border border-border px-4 py-3" data-pf-espectro-metodologia>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[length:var(--text-body-sm)] font-bold">
        Como classificamos
        <span aria-hidden="true" className="text-muted-foreground transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)] group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="mt-2 space-y-2 text-[length:var(--text-body-sm)] leading-relaxed text-foreground">
        <p>
          A classificação é o mapa editorial do Puxa Ficha para cada partido, em dois eixos (econômico e social, de 1 a 10),
          o mesmo usado no quiz. A média dos dois eixos abaixo de 4,5 é esquerda, de 4,5 a 5,5 é centro e acima de 5,5 é
          direita.
        </p>
        <p>
          É a posição do partido, não a da pessoa eleita. Parte dos eixos tem fonte no programa do próprio partido e parte é
          curadoria editorial: dos {NUMERO.format(m.partidos)} partidos contados aqui, {NUMERO.format(m.fonte_nos_dois_eixos)}{" "}
          têm os dois eixos com fonte documentada e {NUMERO.format(m.com_curadoria)} têm ao menos um eixo de curadoria. Eleitos: TSE.
        </p>
      </div>
    </details>
  )
}

/** Senado: lista de classes com o número de cadeiras, ao lado do arco. */
function ListaSenado({ linha }: { linha: LinhaEspectro }) {
  return (
    <ul className="border-t border-border">
      {contagens(linha).map(({ classe, n }) => (
        <li key={classe} className="flex items-center gap-3 border-b border-border py-2.5">
          <Amostra classe={classe} tamanho="size-3.5" />
          <span className="flex-1 text-[length:var(--text-body-sm)] font-medium text-foreground">{rotuloGrafico(classe)}</span>
          <span className="font-heading text-[length:var(--text-heading-sm)] leading-none tabular-nums text-foreground">{NUMERO.format(n)}</span>
        </li>
      ))}
    </ul>
  )
}

function linhaDe(espectro: EspectroEleitos, cargo: LinhaEspectro["cargo"]): LinhaEspectro | undefined {
  return espectro.linhas.find((l) => l.cargo === cargo)
}

/** Espectro político dos eleitos. `data` existe para teste; em produção lê o snapshot do módulo. */
export function EspectroEleitos1Turno({ data = getResultados1Turno() }: { data?: Resultados1Turno }) {
  if (!hasResultados1Turno(data)) return null
  const espectro = contarEspectroEleitos(data)
  const senado = linhaDe(espectro, "Senador")
  const camara = linhaDe(espectro, "Deputado Federal")
  const governador = linhaDe(espectro, "Governador")
  const assembleias = linhaDe(espectro, "Deputado Estadual e Distrital")
  // Cada aviso sai do motivo registrado na contagem, nunca de suposição pelo cargo.
  const segundoTurno = espectro.pendencias.filter((p) => p.motivo === "segundo_turno")
  const semEleitos = espectro.pendencias.filter((p) => p.motivo === "sem_eleitos")
  const semFechamento = espectro.pendencias.filter((p) => p.motivo === "sem_fechamento")
  const listar = (lista: typeof segundoTurno) => lista.map((p) => `${p.cargo} (${p.ufs.join(", ")})`).join("; ")

  const classesNoTopo = new Set<ClasseGrafico>(
    [senado, camara, governador, assembleias].flatMap((l) => (l && l.vagas > 0 ? contagens(l).map((c) => c.classe) : [])),
  )

  return (
    <section id="espectro" className="scroll-mt-24" aria-labelledby="espectro-titulo" data-pf-espectro-eleitos>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <TituloSecao titulo="Como ficou o poder" id="espectro-titulo">
          Distribuição dos eleitos por campo político, pela classe do partido. Presidente vai ao 2º turno e não entra.
        </TituloSecao>
        <LegendaEspectro classes={[...classesNoTopo]} />
      </div>
      <SlashDivider className="mb-8 mt-6" />

      <div className="grid gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:divide-x lg:divide-border">
        {camara && camara.vagas > 0 && (
          <figure className="min-w-0 space-y-5 lg:pr-10" aria-label="Câmara dos Deputados">
            <TituloBloco titulo="Câmara dos Deputados" linha={camara} />
            <Hemiciclo titulo="Câmara dos Deputados" linha={camara} id="espectro-camara" />
            <BarraComNumeros linha={camara} id="espectro-camara-barra" />
          </figure>
        )}
        {senado && senado.vagas > 0 && (
          <figure className="min-w-0 space-y-5 lg:pl-10" aria-label="Senado">
            <TituloBloco titulo="Senado" linha={senado} />
            <ArcoSenado linha={senado} id="espectro-senado" />
            <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
              Senadores eleitos nesta eleição: {NUMERO.format(senado.eleitos)} das 81 cadeiras.
            </p>
            <ListaSenado linha={senado} />
          </figure>
        )}
      </div>

      {((governador && governador.vagas > 0) || (assembleias && assembleias.vagas > 0)) && (
        <div className="mt-12 border-t border-border pt-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className="font-heading text-[length:var(--text-heading)] uppercase leading-none text-foreground">Nos estados</h3>
            <p className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">Governos e assembleias estaduais eleitos nesta eleição.</p>
          </div>
          <div className="mt-6 grid gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:divide-x lg:divide-border">
            {governador && governador.vagas > 0 && (
              <div className="min-w-0 lg:pr-10">
                <TabelaGovernadores linha={governador} data={data} />
              </div>
            )}
            {assembleias && assembleias.vagas > 0 && (
              <figure className="min-w-0 space-y-5 lg:pl-10" aria-label="Assembleias e Câmara Legislativa">
                <TituloBloco titulo="Assembleias e Câmara Legislativa" linha={assembleias} tamanho="sm" />
                <BarraComNumeros linha={assembleias} id="espectro-assembleias" />
              </figure>
            )}
          </div>
        </div>
      )}

      {espectro.pendencias.length > 0 && (
        <div role="status" data-pf-espectro-pendencia className="mt-8 space-y-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          {segundoTurno.length > 0 && <p>Decidido no 2º turno, em 25/10: {listar(segundoTurno)}.</p>}
          {semEleitos.length > 0 && <p>Ainda sem todos os eleitos no TSE: {listar(semEleitos)}.</p>}
          {semFechamento.length > 0 && <p>Sem fechamento oficial do TSE: {listar(semFechamento)}.</p>}
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <Link href="/quiz/metodologia" className="inline-flex min-h-11 items-center gap-1 text-[length:var(--text-body-sm)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]">
          Como classificamos os partidos <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <PorPartido espectro={espectro} />
          <Metodologia espectro={espectro} />
        </div>
      </div>
    </section>
  )
}
