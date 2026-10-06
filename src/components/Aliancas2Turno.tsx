// cspell:ignore alianca aliancas legivel liberou metodo
import type { CSSProperties } from "react"
import {
  barraEliminados,
  eliminadosDaDisputa,
  formatarColeta,
  formatarDiaDeclaracao,
  itemDoEliminado,
  montarMeuCandidatoSaiu,
  rotuloPosicao,
  type Aliancas2Turno,
  type ChaveSegmento,
  type ItemAlianca,
} from "@/lib/aliancas-2turno"
import { nomeLegivel } from "@/lib/compartilhar-duelo"
import { corDoPartido } from "@/lib/cores-finalistas"
import { formatarPercentual, type DisputaResultado1Turno, type Resultados1Turno } from "@/lib/resultados-1turno"
import { TituloSecao } from "@/components/Resultado1TurnoPartes"
import { HACHURA } from "@/components/SegundoTurnoPresidente"
import { SlashDivider } from "@/components/SlashDivider"
import { FonteDeclaracao } from "@/components/FonteDeclaracao"
import { MeuCandidatoSaiu } from "@/components/MeuCandidatoSaiu"

const AVISO_NEUTRALIDADE = "Sem declaração encontrada não significa neutralidade."

function estiloSegmento(chave: ChaveSegmento, cores: Record<"a" | "b", string>): CSSProperties {
  if (chave === "a" || chave === "b") return { backgroundColor: cores[chave] }
  if (chave === "neutro") return { backgroundColor: "var(--gray-400)" }
  return { backgroundColor: "var(--gray-100)", backgroundImage: HACHURA }
}

function primeiraFonte(item: ItemAlianca) {
  const f = item.fontes.find((x) => x.trecho.length > 0)
  return f ? { url: f.url, veiculo: f.veiculo, trecho: f.trecho } : null
}

/**
 * "Quem apoia quem no 2º turno": a barra dos votos dos eliminados pela posição
 * declarada, a lista dos eliminados a Presidente, a posição dos partidos e o
 * seletor "Votou em quem saiu?". Arquivo inválido: a página nem chama.
 */
export function Aliancas2TurnoSecao({
  aliancas,
  disputa,
  data,
}: {
  aliancas: Aliancas2Turno
  disputa: DisputaResultado1Turno
  data: Resultados1Turno
}) {
  const barra = barraEliminados(aliancas, disputa)
  if (!barra) return null
  const coleta = formatarColeta(aliancas.coletado_em)
  const [fa, fb] = barra.finalistas
  const cores = { a: corDoPartido(fa.partido)?.cor ?? "var(--gray-950)", b: corDoPartido(fb.partido)?.cor ?? "var(--gray-600)" }
  const eliminados = eliminadosDaDisputa(disputa)
  const partidos = aliancas.itens.filter((i) => i.tipo === "partido" && i.disputa === "Presidente")
  const partidosDeclarados = partidos.filter((i) => i.posicao !== "sem_declaracao")
  const partidosSem = partidos.filter((i) => i.posicao === "sem_declaracao")
  const meuCandidato = montarMeuCandidatoSaiu(aliancas, data)
  const resumoBarra = barra.segmentos.map((s) => `${s.rotulo}: ${formatarPercentual(s.percentual)}`).join("; ")
  return (
    <section id="quem-apoia-quem" className="scroll-mt-24" aria-labelledby="quem-apoia-quem-titulo" data-pf-aliancas-2turno>
      <TituloSecao titulo="Quem apoia quem no 2º turno" id="quem-apoia-quem-titulo">
        O que os candidatos eliminados à Presidência declararam, com a fonte de cada declaração.
      </TituloSecao>
      <SlashDivider className="mb-6 mt-6" />

      <div className="space-y-3">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-heading text-3xl leading-none tabular-nums text-foreground sm:text-4xl" data-pf-eliminados-percentual>
            {formatarPercentual(barra.percentual)}
          </span>
          <span className="text-[length:var(--text-body-sm)] font-medium text-muted-foreground">
            Votos dos eliminados no 1º turno, pela posição declarada do candidato
          </span>
        </p>
        <div role="img" aria-label={`Votos dos eliminados no 1º turno, ${formatarPercentual(barra.percentual)} dos válidos, pela posição declarada do candidato. ${resumoBarra}.`} className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--gray-100)]" data-pf-eliminados-barra>
          {barra.segmentos
            .filter((s) => s.votos > 0)
            .map((s) => (
              <span key={s.chave} data-pf-segmento={s.chave} className="block h-full" style={{ width: `${(s.votos / barra.votos) * 100}%`, ...estiloSegmento(s.chave, cores) }} />
            ))}
        </div>
        <ul className="grid gap-x-6 gap-y-1 text-[length:var(--text-caption)] font-medium text-muted-foreground sm:grid-cols-2 lg:grid-cols-4" data-pf-eliminados-legenda>
          {barra.segmentos.map((s) => (
            <li key={s.chave} className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block size-3 shrink-0 rounded-sm border border-border" style={estiloSegmento(s.chave, cores)} />
              <span>
                {s.rotulo}: <span className="font-bold tabular-nums text-foreground">{formatarPercentual(s.percentual)}</span>
                              </span>
            </li>
          ))}
        </ul>
        <p className="text-[length:var(--text-caption)] font-bold text-foreground">Declaração de apoio não transfere votos.</p>
      </div>

      {/* Celular: o seletor vem logo depois da barra. Desktop: lista à esquerda; seletor e partidos à direita. */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <h3 className="font-heading text-xl uppercase leading-tight text-foreground">Os {eliminados.length} eliminados à Presidência</h3>
          <ul className="mt-3 divide-y divide-border border-y border-border" data-pf-eliminados-lista>
            {eliminados.map((c) => {
              const item = itemDoEliminado(aliancas, disputa, c.sq)
              const declarada = item !== null && item.posicao !== "sem_declaracao"
              const fonte = declarada ? primeiraFonte(item) : null
              const apoiado = item?.posicao === "apoio" ? (item.apoia_sq === fa.sq ? "a" : "b") : null
              return (
                <li key={c.sq} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-center" data-pf-eliminado={c.slug ?? c.sq}>
                  <span className="min-w-0 text-[length:var(--text-body-sm)] font-bold text-foreground sm:col-start-1 sm:row-start-1">
                    {nomeLegivel(c.nome_urna)} <span className="font-medium text-muted-foreground">{c.partido}</span>
                  </span>
                  <span className="text-right text-[length:var(--text-body-sm)] font-bold tabular-nums text-foreground sm:col-start-3 sm:row-start-1">{formatarPercentual(c.percentual_validos)}</span>
                  <span className="col-span-2 flex flex-wrap items-center gap-x-3 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                    {declarada ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gray-100)] px-2.5 py-0.5 text-[length:var(--text-caption)] font-bold text-foreground" data-pf-posicao={item.posicao}>
                        {apoiado && <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ backgroundColor: cores[apoiado] }} />}
                        {rotuloPosicao(item)}
                      </span>
                    ) : (
                      <span className="text-[length:var(--text-caption)] font-medium text-muted-foreground" data-pf-posicao="sem_declaracao">
                        Sem declaração pública até {coleta}
                      </span>
                    )}
                    {fonte && <FonteDeclaracao fonte={fonte} data={formatarDiaDeclaracao(item!.data_declaracao)} />}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        {meuCandidato && (
          <div className="order-first lg:order-none lg:col-start-2 lg:row-start-1">
            <MeuCandidatoSaiu dados={meuCandidato} />
          </div>
        )}
        {partidos.length > 0 && (
          <div className="lg:col-start-2 lg:row-start-2" data-pf-aliancas-partidos>
            <h3 className="font-heading text-xl uppercase leading-tight text-foreground">Partidos</h3>
            {partidosDeclarados.length > 0 && (
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {partidosDeclarados.map((p) => {
                  const fonte = primeiraFonte(p)
                  return (
                    <li key={p.partido} className="flex flex-wrap items-center gap-x-3 py-2">
                      <span className="text-[length:var(--text-body-sm)] font-bold text-foreground">{p.partido}</span>
                      <span className="inline-flex rounded-full bg-[var(--gray-100)] px-2.5 py-0.5 text-[length:var(--text-caption)] font-bold text-foreground">{rotuloPosicao(p)}</span>
                      {fonte && <FonteDeclaracao fonte={fonte} data={formatarDiaDeclaracao(p.data_declaracao)} />}
                    </li>
                  )
                })}
              </ul>
            )}
            {partidosSem.length > 0 && (
              <p className="mt-2 text-[length:var(--text-caption)] font-medium text-muted-foreground">
                Sem declaração pública até {coleta}: {partidosSem.map((p) => p.partido).join(", ")}.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mt-6 max-w-prose text-[length:var(--text-caption)] font-medium leading-relaxed text-muted-foreground" data-pf-aliancas-nota>
        Coleta em {coleta}. {aliancas.metodo}
        {aliancas.metodo.includes(AVISO_NEUTRALIDADE) ? "" : ` ${AVISO_NEUTRALIDADE}`} Percentuais sobre os votos válidos do 1º turno, pelo resultado oficial do TSE.
      </p>
    </section>
  )
}
