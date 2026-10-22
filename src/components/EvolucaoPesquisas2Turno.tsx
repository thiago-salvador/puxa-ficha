"use client"

// cspell:ignore Diarias diarias periodo resetar minimo maximo

import { useEffect, useId, useRef, useState } from "react"
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react"
import type { Pesquisa2TurnoLinha } from "@/lib/segundo-turno-2026"
import { agruparPesquisasDiarias, filtrarPesquisasDiarias, formatarMediaPesquisa, type DiaPesquisa } from "@/lib/pesquisas-diarias"
import { safeHref } from "@/lib/utils"
import styles from "./EvolucaoPesquisas2Turno.module.css"

const dataLonga = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
const percentual = (valor: number) => `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
const data = (valor: string | null, longa = false) => valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)
  && Number.isFinite(Date.parse(`${valor}T12:00:00Z`)) && new Date(`${valor}T12:00:00Z`).toISOString().slice(0, 10) === valor
  ? (longa ? dataLonga : dataCurta).format(new Date(`${valor}T12:00:00Z`)) : "Data não informada"

function ListaPesquisas({ linhas, nomes, cores, expandida = false }: {
  linhas: Pesquisa2TurnoLinha[]; nomes: [string, string]; cores: [string, string]; expandida?: boolean
}) {
  const [todas, setTodas] = useState(false)
  const visiveis = expandida || todas ? linhas : linhas.slice(0, 6)
  return <div className={styles.researchList}>
    <ol data-pf-pesquisas-2turno="" aria-label="Pesquisas e fontes">
      {visiveis.map(linha => <li key={linha.id}>
        <div><strong>{linha.instituto}</strong><p>{data(linha.data)}{linha.margem !== null && <> · margem ±{linha.margem.toLocaleString("pt-BR")} p.p.</>}{linha.registro && <> · {linha.registro}</>}</p></div>
        <div className={styles.originalValues}>{nomes.map((nome, i) => <span key={nome} style={{ color: cores[i] }}>{nome}<strong>{percentual(linha.percentuais[i])}</strong></span>)}</div>
        {safeHref(linha.url) && <a href={safeHref(linha.url)!} target="_blank" rel="noopener noreferrer" aria-label={`Fonte da pesquisa ${linha.instituto} de ${data(linha.data)} (abre em nova aba)`}>Fonte <ArrowUpRight size={16} aria-hidden="true" /></a>}
      </li>)}
    </ol>
    {!expandida && !todas && linhas.length > 6 && <button type="button" className={styles.textAction} onClick={() => setTodas(true)}>Ver as {linhas.length} pesquisas desta data <ArrowRight size={16} aria-hidden="true" /></button>}
  </div>
}

export function EvolucaoPesquisas2Turno({ linhas, nomes, cores, limiteLista = 6 }: {
  linhas: Pesquisa2TurnoLinha[]; nomes: [string, string]; cores: [string, string]; limiteLista?: number
}) {
  const id = useId()
  const series = agruparPesquisasDiarias(linhas)
  const [grupo, setGrupo] = useState(series[0]?.id ?? "")
  const [instituto, setInstituto] = useState("all")
  const [periodo, setPeriodo] = useState<"all" | "30" | "15">("30")
  const [vista, setVista] = useState<"evolucao" | "pesquisas">("evolucao")
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const serie = series.find(item => item.id === grupo) ?? series[0]
  const institutos = [...new Set(serie?.linhas.map(item => item.instituto) ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const institutoAtivo = institutos.includes(instituto) ? instituto : "all"
  const filtradas = filtrarPesquisasDiarias(serie?.linhas ?? [], { instituto: institutoAtivo, periodo })
  const dias = agruparPesquisasDiarias(filtradas)[0]?.dias ?? []
  const indiceDia = Math.max(0, dias.findIndex(dia => dia.data === selecionada))
  const dia = dias.find(item => item.data === selecionada) ?? dias.at(-1)
  const indiceAtual = dia ? dias.indexOf(dia) : indiceDia
  const resetar = () => { setSelecionada(null); setMostrarTodas(false) }
  const irParaDia = (item: DiaPesquisa) => { setSelecionada(item.data); setMostrarTodas(false) }
  const botoesDatas = useRef<(HTMLButtonElement | null)[]>([])
  const painel = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(1000)
  useEffect(() => {
    const elemento = painel.current
    if (!elemento) return
    const observer = new ResizeObserver(([entrada]) => setLargura(Math.max(280, entrada.contentRect.width)))
    observer.observe(elemento)
    return () => observer.disconnect()
  }, [])

  const compacto = largura < 640
  const altura = compacto ? 260 : 340
  const esquerda = compacto ? 38 : 48
  const direita = largura - (compacto ? 16 : 176)
  const topo = 24
  const fundo = altura - 30
  const valores = dias.flatMap(item => item.percentuais)
  const minimo = Math.max(0, Math.floor((Math.min(50, ...valores) - 1) / 5) * 5)
  const maximo = Math.min(100, Math.ceil((Math.max(50, ...valores) + 1) / 5) * 5)
  const primeiro = dias[0]?.data
  const ultimo = dias.at(-1)
  const inicio = primeiro ? Date.parse(`${primeiro}T12:00:00Z`) : 0
  const fim = ultimo ? Date.parse(`${ultimo.data}T12:00:00Z`) : inicio
  const x = (valor: string) => fim === inicio ? (esquerda + direita) / 2 : esquerda + (Date.parse(`${valor}T12:00:00Z`) - inicio) / (fim - inicio) * (direita - esquerda)
  const y = (valor: number) => topo + (maximo - valor) / (maximo - minimo) * (fundo - topo)
  const marcas = Array.from({ length: (maximo - minimo) / 5 + 1 }, (_, i) => minimo + i * 5)
  const datasEixo = dias.filter((item, i) => i === 0 || i === dias.length - 1 || (!compacto && i % Math.ceil(dias.length / 5) === 0))
  const rotulosFinais = ultimo ? ([0, 1] as const).map(i => ({ i, valor: ultimo.percentuais[i], ancora: y(ultimo.percentuais[i]), posicao: y(ultimo.percentuais[i]) })).sort((a, b) => a.ancora - b.ancora) : []
  if (rotulosFinais.length === 2) {
    rotulosFinais[0].posicao = Math.max(topo + 20, Math.min(rotulosFinais[0].ancora, fundo - 74))
    rotulosFinais[1].posicao = Math.min(fundo - 16, Math.max(rotulosFinais[1].ancora, rotulosFinais[0].posicao + 58))
  }
  const total = filtradas.length

  return <div className={styles.root} data-pf-evolucao-2turno="">
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="tablist" aria-label="Visualização das pesquisas">
        {(["evolucao", "pesquisas"] as const).map((aba, i) => <button key={aba} type="button" role="tab" id={`${id}-tab-${aba}`} aria-selected={vista === aba} aria-controls={`${id}-painel-${aba}`} tabIndex={vista === aba ? 0 : -1} onClick={() => setVista(aba)} onKeyDown={event => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault()
            const proxima = event.key === "Home" ? "evolucao" : event.key === "End" ? "pesquisas" : i === 0 ? "pesquisas" : "evolucao"
            setVista(proxima)
            document.getElementById(`${id}-tab-${proxima}`)?.focus()
          }
        }}>{aba === "evolucao" ? "Evolução" : "Pesquisas"}</button>)}
      </div>
      <div className={styles.filters}>
        {series.length > 1 && <label>Base da pesquisa<select aria-label="Base da pesquisa" value={serie?.id ?? ""} onChange={event => { setGrupo(event.target.value); setInstituto("all"); resetar() }}>{series.map(item => <option key={item.id} value={item.id}>{item.rotulo}</option>)}</select></label>}
        <label>Instituto<select aria-label="Instituto" value={institutoAtivo} onChange={event => { setInstituto(event.target.value); resetar() }}><option value="all">Todos os institutos</option>{institutos.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Período<select aria-label="Período" value={periodo} onChange={event => { setPeriodo(event.target.value as typeof periodo); resetar() }}><option value="30">Últimos 30 dias</option><option value="15">Últimos 15 dias</option><option value="all">Todo o período</option></select></label>
      </div>
    </div>
    <p className={styles.base}>{serie?.rotulo ?? "Pesquisas do confronto"}</p>
    <p className={styles.description} id={`${id}-descricao`}>As linhas mostram a média dos levantamentos divulgados em cada data. Selecione um ponto para consultar as pesquisas e suas fontes.</p>
    <div role="tabpanel" id={`${id}-painel-evolucao`} aria-labelledby={`${id}-tab-evolucao`} hidden={vista !== "evolucao"}>
      {!dias.length && <p className={styles.notice} role="status">Nenhuma pesquisa com data de publicação verificada neste filtro. Consulte os resultados e as fontes na aba Pesquisas.</p>}
      {dias.length === 1 && <p className={styles.notice}>Uma data disponível neste filtro. Os pontos mostram os resultados; ainda não há evolução no tempo.</p>}
      <figure className={styles.figure} data-pf-tendencia-2turno="" aria-describedby={`${id}-descricao`}>
        <div ref={painel} className={styles.chart}>
          {dias.length > 0 && <>
            <svg width="100%" height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true">
              {marcas.map(valor => <g key={valor}><line x1={esquerda} x2={direita} y1={y(valor)} y2={y(valor)} className={styles.grid} /><text x={esquerda - 10} y={y(valor) + 4} textAnchor="end" className={styles.axis}>{valor}%</text></g>)}
              <line x1={esquerda} x2={direita} y1={fundo} y2={fundo} className={styles.baseline} />
              {dia && <line x1={x(dia.data)} x2={x(dia.data)} y1={topo} y2={fundo} className={styles.cursor} />}
              {([0, 1] as const).map(i => <g key={i}>
                {dias.length > 1 && <polyline data-pf-media-linha={i} points={dias.map(item => `${x(item.data)},${y(item.percentuais[i])}`).join(" ")} fill="none" stroke={cores[i]} strokeWidth={3} strokeLinejoin="round" />}
                {dias.map(item => <circle key={item.data} data-pf-media-ponto={item.data} cx={x(item.data)} cy={y(item.percentuais[i])} r={5} fill={cores[i]} stroke="var(--background)" strokeWidth={2} />)}
              </g>)}
              {!compacto && ultimo && rotulosFinais.map(item => <g key={item.i} data-pf-media-final={item.i} fill={cores[item.i]}><path d={`M${x(ultimo.data) + 8},${item.ancora} L${direita + 12},${item.ancora} L${direita + 22},${item.posicao}`} stroke={cores[item.i]} fill="none" strokeWidth={1} /><text x={direita + 30} y={item.posicao - 8} className={styles.endpointName}>{nomes[item.i]}</text><text x={direita + 30} y={item.posicao + 22} className={styles.endpointValue}>{formatarMediaPesquisa(item.valor)}</text></g>)}
              {datasEixo.map((item, i) => <text key={item.data} x={x(item.data)} y={altura - 7} textAnchor={i === 0 ? "start" : i === datasEixo.length - 1 ? "end" : "middle"} className={styles.axis}>{data(item.data)}</text>)}
            </svg>
            <div className={styles.dateTargets} role="group" aria-label="Datas das pesquisas">{dias.map((item, i) => <button type="button" key={item.data} ref={node => { botoesDatas.current[i] = node }} className={styles.dateTarget} style={{ left: `${x(item.data) / largura * 100}%`, top: topo, height: fundo - topo }} aria-label={`${data(item.data, true)}, ${item.pesquisas.length} ${item.pesquisas.length === 1 ? "pesquisa" : "pesquisas"}: ${nomes[0]} ${formatarMediaPesquisa(item.percentuais[0])}, ${nomes[1]} ${formatarMediaPesquisa(item.percentuais[1])}`} aria-pressed={dia === item} onClick={() => irParaDia(item)} onFocus={() => irParaDia(item)} onKeyDown={event => {
              if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
                event.preventDefault()
                const proximo = event.key === "Home" ? 0 : event.key === "End" ? dias.length - 1 : Math.max(0, Math.min(dias.length - 1, i + (event.key === "ArrowRight" ? 1 : -1)))
                botoesDatas.current[proximo]?.focus()
              }
            }} />)}</div>
          </>}
        </div>
        <figcaption className={styles.legend}>
          {nomes.map((nome, i) => <span key={nome} style={{ color: cores[i] }}><svg width="30" height="16" aria-hidden="true"><path d="M0 8 H30" stroke="currentColor" strokeWidth={3} /><circle cx={15} cy={8} r={4} fill="currentColor" /></svg>{nome}</span>)}
        </figcaption>
      </figure>
      {dia && <>
        <div className={styles.daySummary} aria-live="polite" aria-atomic="true" data-pf-dia-selecionado={dia.data}>
          <div><strong className={styles.dayTitle}>{data(dia.data)}</strong><span>{dia.pesquisas.length} {dia.pesquisas.length === 1 ? "pesquisa" : "pesquisas"}</span></div>
          {nomes.map((nome, i) => <div key={nome} style={{ color: cores[i] }}><span>{nome}</span><strong className={styles.dayValue}>{formatarMediaPesquisa(dia.percentuais[i])}</strong></div>)}
          <button type="button" className={styles.textAction} onClick={() => document.getElementById(`${id}-fontes`)?.scrollIntoView({ behavior: "instant", block: "nearest" })}>Ver pesquisas desta data <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        <div className={styles.dateNavigation} aria-label="Navegar pelas datas"><button type="button" disabled={indiceAtual <= 0} onClick={() => irParaDia(dias[indiceAtual - 1])}><ChevronLeft size={16} aria-hidden="true" />Anterior</button><span>{indiceAtual + 1} de {dias.length} datas</span><button type="button" disabled={indiceAtual >= dias.length - 1} onClick={() => irParaDia(dias[indiceAtual + 1])}>Próxima<ChevronRight size={16} aria-hidden="true" /></button></div>
        <div id={`${id}-fontes`} className={styles.daySources}><h3>Pesquisas de {data(dia.data)}</h3><ListaPesquisas linhas={dia.pesquisas} nomes={nomes} cores={cores} /></div>
      </>}
      <p className={styles.footnote}>Média simples por data de divulgação. Dias sem pesquisa não recebem pontos. A média não é previsão nem tem margem de erro própria.</p>
      <details className={styles.method}><summary>Entenda o cálculo da média</summary><p>Média aritmética simples por data de divulgação: cada pesquisa tem o mesmo peso. Só combinamos pesquisas do mesmo confronto, ano, cargo, território, modalidade e base de votos verificados. Registros repetidos contam uma vez. Dias sem pesquisa não recebem pontos: os segmentos apenas conectam as datas disponíveis, sem estimar resultados intermediários. A composição de institutos pode mudar entre datas. A média é descritiva, não é previsão e não tem margem de erro própria.</p><p>Os filtros de instituto e período recalculam a média. O período é contado a partir da publicação mais recente desta série.</p></details>
    </div>
    <div role="tabpanel" id={`${id}-painel-pesquisas`} aria-labelledby={`${id}-tab-pesquisas`} hidden={vista !== "pesquisas"}>
      <p className={styles.listCount}>{total} {total === 1 ? "pesquisa neste filtro" : "pesquisas neste filtro"}, da mais recente para a mais antiga.</p>
      <ListaPesquisas linhas={mostrarTodas ? filtradas : filtradas.slice(0, limiteLista)} nomes={nomes} cores={cores} expandida />
      {!mostrarTodas && total > limiteLista && <button className={styles.textAction} type="button" onClick={() => setMostrarTodas(true)}>Ver todas as {total} pesquisas <ArrowRight size={16} aria-hidden="true" /></button>}
    </div>
  </div>
}
