import Link from "next/link"
import { contarEspectroEleitos, rotuloClasseEspectro, type EspectroEleitos, type LinhaEspectro } from "@/lib/espectro-eleitos"
import { getResultados1Turno, hasResultados1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { SlashDivider } from "@/components/SlashDivider"
import { TituloSecao } from "@/components/Resultado1TurnoPartes"
import { Amostra, BarraEspectro, Hemiciclo, QuadradosGovernadores } from "@/components/EspectroGraficos"

const NUMERO = new Intl.NumberFormat("pt-BR")

function rotuloEleitos(l: LinhaEspectro): string {
  return `${NUMERO.format(l.eleitos)} de ${NUMERO.format(l.vagas)} vagas`
}

function LinhaTabela({ linha, comSem, total }: { linha: LinhaEspectro; comSem: boolean; total?: boolean }) {
  const forte = total ? "font-bold" : ""
  const celula = `px-3 py-3 text-right tabular-nums ${forte}`.trim()
  return (
    <tr className={`border-t align-middle ${total ? "border-t-2 border-foreground bg-secondary" : "border-border"}`}>
      <th scope="row" className={`px-3 py-3 ${forte || "font-semibold"}`}>
        {linha.cargo}
      </th>
      <td className={`px-3 py-3 tabular-nums ${forte}`.trim()}>{rotuloEleitos(linha)}</td>
      <td className={celula}>{linha.esquerda}</td>
      <td className={celula}>{linha.centro}</td>
      <td className={celula}>{linha.direita}</td>
      {comSem && <td className={celula}>{linha.sem_classificacao}</td>}
    </tr>
  )
}

function TabelaResumo({ espectro, comSem }: { espectro: EspectroEleitos; comSem: boolean }) {
  const cabecalho = "px-3 py-2.5 text-right"
  return (
    <div className="relative overflow-x-auto rounded-[12px] border border-border" tabIndex={0} role="region" aria-label="Eleitos por cargo e espectro">
      <table className="w-full border-collapse text-left text-[length:var(--text-caption)] sm:text-[length:var(--text-body-sm)]">
        <caption className="sr-only">Eleitos no 1º turno por cargo, divididos em esquerda, centro e direita pelo partido</caption>
        <thead className="bg-secondary text-[length:var(--text-eyebrow)] font-bold uppercase tracking-[0.08em] text-secondary-foreground">
          <tr>
            <th scope="col" className="px-3 py-2.5">Cargo</th>
            <th scope="col" className="px-3 py-2.5">Eleitos</th>
            <th scope="col" className={cabecalho}>
              <span className="inline-flex items-center gap-1.5"><Amostra classe="esquerda" />Esquerda</span>
            </th>
            <th scope="col" className={cabecalho}>
              <span className="inline-flex items-center gap-1.5"><Amostra classe="centro" />Centro</span>
            </th>
            <th scope="col" className={cabecalho}>
              <span className="inline-flex items-center gap-1.5"><Amostra classe="direita" />Direita</span>
            </th>
            {comSem && (
              <th scope="col" className={cabecalho}>
                <span className="inline-flex items-center gap-1.5"><Amostra classe="sem_classificacao" />Sem classificação</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {espectro.linhas.map((l) => (
            <LinhaTabela key={l.cargo} linha={l} comSem={comSem} />
          ))}
          <LinhaTabela linha={espectro.total} comSem={comSem} total />
        </tbody>
      </table>
    </div>
  )
}

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
    <aside
      aria-label="Como lemos o espectro"
      data-pf-espectro-metodologia
      className="space-y-2 rounded-[12px] bg-secondary px-4 py-4 text-[length:var(--text-body-sm)] leading-relaxed"
    >
      <p className="font-bold">Como classificamos</p>
      <p>
        A classificação é o mapa editorial do Puxa Ficha para cada partido, em dois eixos (econômico e social, de 1 a 10),
        o mesmo usado no quiz. A média dos dois eixos abaixo de 4,5 é esquerda, de 4,5 a 5,5 é centro e acima de 5,5 é
        direita.
      </p>
      <p>
        É a posição do partido, não a da pessoa eleita. Parte dos eixos tem fonte no programa do próprio partido e parte é
        curadoria editorial: dos {NUMERO.format(m.partidos)} partidos contados aqui, {NUMERO.format(m.fonte_nos_dois_eixos)}{" "}
        têm os dois eixos com fonte documentada e {NUMERO.format(m.com_curadoria)} têm ao menos um eixo de curadoria.
      </p>
      <p>
        Eleitos: TSE.{" "}
        <Link href="/quiz/metodologia" className="font-bold underline underline-offset-4">
          Como classificamos os partidos
        </Link>
      </p>
    </aside>
  )
}

function linhaDe(espectro: EspectroEleitos, cargo: LinhaEspectro["cargo"]): LinhaEspectro | undefined {
  return espectro.linhas.find((l) => l.cargo === cargo)
}

/** Espectro político dos eleitos. `data` existe para teste; em produção lê o snapshot do módulo. */
export function EspectroEleitos1Turno({ data = getResultados1Turno() }: { data?: Resultados1Turno }) {
  if (!hasResultados1Turno(data)) return null
  const espectro = contarEspectroEleitos(data)
  const comSem = espectro.total.sem_classificacao > 0
  const senado = linhaDe(espectro, "Senador")
  const camara = linhaDe(espectro, "Deputado Federal")
  const governador = linhaDe(espectro, "Governador")
  const assembleias = linhaDe(espectro, "Deputado Estadual e Distrital")
  // Governador sem eleito é estado com 2º turno (25/10), não apuração pendente; deputado sem todos os eleitos é bancada sem fechamento.
  const segundoTurno = espectro.pendencias.find((p) => p.cargo === "Governador")
  const bancadas = espectro.pendencias.filter((p) => p.cargo !== "Governador")

  return (
    <section id="espectro" className="scroll-mt-24" aria-labelledby="espectro-titulo" data-pf-espectro-eleitos>
      <TituloSecao titulo="Espectro político dos eleitos" id="espectro-titulo">
        Conta só quem já está eleito. Presidente vai ao 2º turno e não entra. A classe é a do partido.
      </TituloSecao>
      <SlashDivider className="mb-8 mt-6" />
      <div className="space-y-10">
        {(segundoTurno || bancadas.length > 0) && (
          <div
            role="status"
            data-pf-espectro-pendencia
            className="space-y-1 rounded-[12px] bg-secondary px-4 py-3 text-[length:var(--text-body-sm)] font-semibold text-foreground"
          >
            {segundoTurno && <p>Governador decidido no 2º turno, em 25/10: {segundoTurno.ufs.join(", ")}.</p>}
            {bancadas.length > 0 && (
              <p>
                Ainda sem todos os eleitos no TSE: {bancadas.map((p) => `${p.cargo} (${p.ufs.join(", ")})`).join("; ")}.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
          {senado && senado.vagas > 0 && <Hemiciclo titulo="Senado" linha={senado} id="espectro-senado" />}
          {camara && camara.vagas > 0 && <Hemiciclo titulo="Câmara dos Deputados" linha={camara} id="espectro-camara" />}
          {governador && governador.vagas > 0 && <QuadradosGovernadores linha={governador} data={data} />}
          {assembleias && assembleias.vagas > 0 && (
            <BarraEspectro titulo="Assembleias e Câmara Legislativa" linha={assembleias} id="espectro-assembleias" />
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-xl uppercase leading-tight text-foreground">Resumo por cargo</h3>
          <TabelaResumo espectro={espectro} comSem={comSem} />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PorPartido espectro={espectro} />
          <Metodologia espectro={espectro} />
        </div>
      </div>
    </section>
  )
}
