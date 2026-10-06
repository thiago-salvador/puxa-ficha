// cspell:ignore alianca aliancas legivel liberou metodo
import { ArrowUpRight } from "lucide-react"
import {
  barraEliminados,
  eliminadosDaDisputa,
  formatarColeta,
  formatarDiaDeclaracao,
  itemDoEliminado,
  rotuloPosicao,
  type Aliancas2Turno,
  type ChaveSegmento,
  type ItemAlianca,
} from "@/lib/aliancas-2turno"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { corDoPartido, coresDosFinalistas } from "@/lib/cores-finalistas"
import { safeHref } from "@/lib/utils"
import { formatarPercentual, type DisputaResultado1Turno } from "@/lib/resultados-1turno"
import { TituloSecao } from "@/components/Resultado1TurnoPartes"
import { HACHURA } from "@/components/SegundoTurnoPresidente"
import { SlashDivider } from "@/components/SlashDivider"
import { FonteDeclaracao } from "@/components/FonteDeclaracao"

const AVISO_NEUTRALIDADE = "Sem declaração encontrada não significa neutralidade."
const REGISTROS_URL = "https://github.com/thiago-salvador/puxa-ficha/blob/main/src/data/aliancas-2turno-2026.json"

function primeiraFonte(item: ItemAlianca) {
  const f = item.fontes.find((x) => x.trecho.length > 0)
  return f ? { url: f.url, veiculo: f.veiculo, trecho: f.trecho } : null
}

/** Cabeçalho de um grupo: bolinha na cor do lado, rótulo e a soma dos votos do grupo. */
function CabecalhoGrupo({ rotulo, percentual, cor, hachura = false }: { rotulo: string; percentual: number; cor: string; hachura?: boolean }) {
  return (
    <h3 className="flex items-baseline gap-2 text-[length:var(--text-body)] font-bold text-foreground">
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 translate-y-[-1px] rounded-full"
        style={hachura ? { backgroundColor: "var(--gray-100)", backgroundImage: HACHURA, boxShadow: "inset 0 0 0 1px var(--gray-400)" } : { backgroundColor: cor }}
      />
      <span className="min-w-0">{rotulo}</span>
      <span className="ml-auto pl-3 font-heading text-[length:var(--text-heading-sm)] leading-none tabular-nums" data-pf-grupo-percentual>
        {formatarPercentual(percentual)}
      </span>
    </h3>
  )
}

/** Uma declaração: nome; partido, posição (fora do grupo de apoio), data e fonte. */
function EntradaDeclarada({ item, nome, partido, mostrarPosicao, chave }: { item: ItemAlianca; nome: string; partido: string; mostrarPosicao: boolean; chave: string }) {
  const fonte = primeiraFonte(item)
  const href = fonte ? safeHref(fonte.url) : null
  const dia = formatarDiaDeclaracao(item.data_declaracao)
  const meta = [partido, mostrarPosicao ? rotuloPosicao(item) : null, dia].filter(Boolean).join(" · ")
  return (
    <li className="py-3" data-pf-eliminado={chave} data-pf-posicao={item.posicao}>
      <p className="text-[length:var(--text-body)] font-bold text-foreground">{nome}</p>
      <p className="mt-0.5 text-[length:var(--text-caption)] font-medium text-muted-foreground">
        <span className="tabular-nums">{meta}</span>
        {href && fonte && (
          <>
            {" · "}
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-0.5 font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]">
              {fonte.veiculo}
              <ArrowUpRight className="size-3" aria-hidden="true" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          </>
        )}
      </p>
    </li>
  )
}

/**
 * "Quem apoia quem": a posição pública dos eliminados à Presidência em dois
 * lados. À esquerda, apoio ao primeiro finalista e neutros; à direita, apoio ao
 * segundo e quem não declarou nada. Cada grupo soma os votos válidos do 1º
 * turno dos seus eliminados. Arquivo inválido: a página nem chama.
 */
export function Aliancas2TurnoSecao({
  aliancas,
  disputa,
}: {
  aliancas: Aliancas2Turno
  disputa: DisputaResultado1Turno
}) {
  const barra = barraEliminados(aliancas, disputa)
  if (!barra) return null
  const coleta = formatarColeta(aliancas.coletado_em)
  const [fa, fb] = barra.finalistas
  const espectro = coresDosFinalistas(fa.partido, fb.partido)
  const cores = {
    a: espectro?.a.cor ?? corDoPartido(fa.partido)?.cor ?? "var(--gray-950)",
    b: espectro?.b.cor ?? corDoPartido(fb.partido)?.cor ?? "var(--gray-600)",
  }
  const segmento = (k: ChaveSegmento) => barra.segmentos.find((s) => s.chave === k)!
  const eliminados = eliminadosDaDisputa(disputa)
  const grupos: Record<ChaveSegmento, { c: (typeof eliminados)[number]; item: ItemAlianca | null }[]> = { a: [], b: [], neutro: [], sem: [] }
  for (const c of [...eliminados].sort((x, y) => y.votos - x.votos)) {
    const item = itemDoEliminado(aliancas, disputa, c.sq)
    const chave: ChaveSegmento = !item || item.posicao === "sem_declaracao" ? "sem" : item.posicao === "apoio" ? (item.apoia_sq === fa.sq ? "a" : "b") : "neutro"
    grupos[chave].push({ c, item })
  }
  const partidos = aliancas.itens.filter((i) => i.tipo === "partido" && i.disputa === "Presidente")
  const partidosDeclarados = partidos.filter((i) => i.posicao !== "sem_declaracao")
  const partidosSem = partidos.filter((i) => i.posicao === "sem_declaracao")

  const listaDeclarados = (k: "a" | "b" | "neutro", vazio: string) =>
    grupos[k].length === 0 ? (
      <p className="py-3 text-[length:var(--text-body-sm)] font-medium text-muted-foreground" data-pf-grupo-vazio={k}>{vazio}</p>
    ) : (
      <ul className="divide-y divide-border">
        {grupos[k].map(({ c, item }) => (
          <EntradaDeclarada key={c.sq} item={item!} nome={nomeLegivel(c.nome_urna)} partido={c.partido} mostrarPosicao={k === "neutro"} chave={c.slug ?? c.sq} />
        ))}
      </ul>
    )

  return (
    <section id="quem-apoia-quem" className="scroll-mt-24" aria-labelledby="quem-apoia-quem-titulo" data-pf-aliancas-2turno>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <TituloSecao titulo="Quem apoia quem" id="quem-apoia-quem-titulo">
          Posições públicas dos candidatos eliminados.
        </TituloSecao>
        <p className="shrink-0 text-[length:var(--text-body-sm)] font-bold text-foreground sm:pb-0.5 sm:text-right" data-pf-aliancas-aviso>
          Apoio declarado não transfere votos.
        </p>
      </div>
      <SlashDivider className="mb-6 mt-6" />

      <div className="grid rounded-[6px] border border-border lg:grid-cols-2 lg:divide-x lg:divide-border" data-pf-aliancas-quadro>
        <div className="space-y-6 p-5 sm:p-6">
          <div data-pf-grupo="a">
            <CabecalhoGrupo rotulo={`Apoia ${nomeLegivel(fa.nome_urna)}`} percentual={segmento("a").percentual} cor={cores.a} />
            {listaDeclarados("a", "Nenhum apoio registrado na captura.")}
          </div>
          <div data-pf-grupo="neutro">
            <CabecalhoGrupo rotulo="Neutro ou voto liberado" percentual={segmento("neutro").percentual} cor="var(--gray-400)" />
            {listaDeclarados("neutro", "Nenhuma posição neutra registrada na captura.")}
          </div>
        </div>
        <div className="space-y-6 border-t border-border p-5 sm:p-6 lg:border-t-0">
          <div data-pf-grupo="b">
            <CabecalhoGrupo rotulo={`Apoia ${nomeLegivel(fb.nome_urna)}`} percentual={segmento("b").percentual} cor={cores.b} />
            {listaDeclarados("b", "Nenhum apoio registrado na captura.")}
          </div>
          <div data-pf-grupo="sem">
            <CabecalhoGrupo rotulo="Sem declaração" percentual={segmento("sem").percentual} cor="" hachura />
            <p className="mt-1 text-[length:var(--text-caption)] font-medium text-muted-foreground">
              {grupos.sem.length} {grupos.sem.length === 1 ? "candidato" : "candidatos"} · Consulta em {coleta}
            </p>
            {grupos.sem.length > 0 && (
              <table className="mt-2 w-full text-[length:var(--text-body-sm)]">
                <caption className="sr-only">Eliminados sem declaração pública até {coleta}, com o % dos votos válidos no 1º turno</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Candidato</th>
                    <th scope="col">Partido</th>
                    <th scope="col">% dos válidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {grupos.sem.map(({ c }) => (
                    <tr key={c.sq} data-pf-eliminado={c.slug ?? c.sq} data-pf-posicao="sem_declaracao">
                      <th scope="row" className="py-2 pr-3 text-left font-bold text-foreground">{nomeLegivel(c.nome_urna)}</th>
                      <td className="py-2 pr-3 font-medium text-muted-foreground">{c.partido}</td>
                      <td className="whitespace-nowrap py-2 text-right font-bold tabular-nums text-foreground">{formatarPercentual(c.percentual_validos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <a
              href={REGISTROS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-[length:var(--text-body-sm)] font-bold text-foreground underline underline-offset-4 hover:text-[var(--gray-600)]"
              data-pf-aliancas-registros
            >
              Ver todos os registros
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          </div>
        </div>
      </div>

      <details className="group mt-6 text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground" data-pf-aliancas-nota>
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-bold text-foreground underline decoration-dotted underline-offset-4 [&::-webkit-details-marker]:hidden">
          Partidos e método
        </summary>
        {partidos.length > 0 && (
          <div className="mt-1 max-w-prose space-y-1" data-pf-aliancas-partidos>
            {partidosDeclarados.map((p) => {
              const fonte = primeiraFonte(p)
              return (
                <div key={p.partido} className="flex flex-wrap items-center gap-x-2">
                  <span>
                    <span className="font-bold text-foreground">{p.partido}</span>: {rotuloPosicao(p)}
                  </span>
                  {fonte && <FonteDeclaracao fonte={fonte} data={formatarDiaDeclaracao(p.data_declaracao)} />}
                </div>
              )
            })}
            {partidosSem.length > 0 && (
              <p>Partidos sem declaração pública até {coleta}: {partidosSem.map((p) => p.partido).join(", ")}.</p>
            )}
          </div>
        )}
        <p className="mt-3 max-w-prose">
          Coleta em {coleta}. {aliancas.metodo}
          {aliancas.metodo.includes(AVISO_NEUTRALIDADE) ? "" : ` ${AVISO_NEUTRALIDADE}`} Percentuais sobre os votos válidos do 1º turno, pelo resultado oficial do TSE.
        </p>
      </details>
    </section>
  )
}
