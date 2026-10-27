// cspell:ignore maximo
import { formatarInteiro } from "@/lib/arquivo-home"

interface Marco {
  /** AAAA-MM-DD; a linha cai na semana que contém a data. */
  data: string
  rotulo: string
}

interface Props {
  id: string
  titulo: string
  /** Segunda-feira de cada semana, AAAA-MM-DD, em ordem. */
  semanas: string[]
  valores: number[]
  /** Como o valor aparece na dica e na tabela: "notícias", "mudanças". */
  unidade: string
  marcos?: Marco[]
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const LARGURA = 640
const ALTURA = 200
const MARGEM = { topo: 26, direita: 4, base: 24, esquerda: 4 }
const VAO = 2
const ROTULO = "pointer-events-none absolute whitespace-nowrap text-[11px] font-medium leading-none"

const pct = (v: number, total: number) => `${(v / total) * 100}%`

function diaMes(iso: string): string {
  const [, mes, dia] = iso.split("-")
  return `${dia}/${mes}`
}

/** Teto do eixo: o próximo 1, 2 ou 5 vezes potência de 10 acima do máximo. */
function teto(maximo: number): number {
  if (maximo <= 0) return 1
  const base = 10 ** Math.floor(Math.log10(maximo))
  return [1, 2, 5, 10].map((m) => m * base).find((v) => v >= maximo)!
}

// Barras por semana, uma série só: a cor é a tinta do texto e o título diz o que é. Cada barra traz a
// dica nativa (title) com a semana e o valor, e a tabela abaixo repete os números para quem não vê o gráfico.
export function ArquivoGraficoSemanal({ id, titulo, semanas, valores, unidade, marcos = [] }: Props) {
  const largura = LARGURA - MARGEM.esquerda - MARGEM.direita
  const altura = ALTURA - MARGEM.topo - MARGEM.base
  const passo = largura / semanas.length
  const maximo = teto(Math.max(...valores))
  const y = (v: number) => MARGEM.topo + altura - (v / maximo) * altura
  const x = (i: number) => MARGEM.esquerda + i * passo
  const indiceDaData = (data: string) => semanas.findLastIndex((s) => s <= data)
  const viradasDeMes = semanas
    .map((s, i) => ({ i, mes: Number(s.slice(5, 7)) }))
    .filter(({ i, mes }) => i === 0 || mes !== Number(semanas[i - 1].slice(5, 7)))
    // O mês da primeira semana só ganha rótulo se tiver espaço até a virada seguinte.
    .filter(({ i }, k, todas) => i !== 0 || (todas[1]?.i ?? Infinity) >= 3)
  const total = valores.reduce((a, b) => a + b, 0)
  const posicoesMarcos = marcos
    .map((m) => ({ ...m, i: indiceDaData(m.data) }))
    .filter((m) => m.i >= 0)
    .map((m) => ({ ...m, cx: x(m.i) + passo / 2 }))

  return (
    <figure className="min-w-0" data-pf-arquivo-grafico={id}>
      <figcaption id={`${id}-titulo`} className="text-[length:var(--text-body-sm)] font-bold text-foreground">
        {titulo}
        <span className="ml-2 font-medium text-muted-foreground">{formatarInteiro(total)} no total</span>
      </figcaption>
      {/* Rótulos em HTML sobre o SVG: o texto fica no tamanho da página em qualquer largura. Os marcos
          ganham uma faixa própria, em degraus, para não se sobreporem quando caem em semanas próximas. */}
      {posicoesMarcos.length > 0 && (
        <div className="relative mt-3" style={{ height: `${posicoesMarcos.length * 14}px` }} aria-hidden="true">
          {posicoesMarcos.map((m, k) => (
            <span key={m.data} className={`${ROTULO} font-bold text-foreground`} style={{ right: `calc(100% - ${pct(m.cx, LARGURA)} + 4px)`, top: `${k * 14}px` }}>
              {m.rotulo}
            </span>
          ))}
        </div>
      )}
      <div className="relative mt-1">
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-titulo`}>
          <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y(maximo)} y2={y(maximo)} className="stroke-border" strokeWidth={1} />
          {valores.map((v, i) => {
            const topo = y(v)
            const larguraBarra = Math.max(passo - VAO, 1)
            const base = MARGEM.topo + altura
            const raio = Math.min(2, larguraBarra / 2, (base - topo) / 2)
            return (
              <g key={semanas[i]}>
                <title>{`Semana de ${diaMes(semanas[i])}: ${formatarInteiro(v)} ${unidade}`}</title>
                {/* Área de toque da semana inteira: a dica aparece mesmo nas barras baixas. */}
                <rect x={x(i)} y={MARGEM.topo} width={passo} height={altura} fill="transparent" />
                {v > 0 && (
                  <path
                    className="fill-foreground"
                    d={`M${x(i)},${base} V${topo + raio} Q${x(i)},${topo} ${x(i) + raio},${topo} H${x(i) + larguraBarra - raio} Q${x(i) + larguraBarra},${topo} ${x(i) + larguraBarra},${topo + raio} V${base} Z`}
                  />
                )}
              </g>
            )
          })}
          <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={MARGEM.topo + altura} y2={MARGEM.topo + altura} className="stroke-foreground" strokeWidth={1} />
          {posicoesMarcos.map((m) => (
            <line key={m.data} x1={m.cx} x2={m.cx} y1={0} y2={MARGEM.topo + altura} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" aria-hidden="true" />
          ))}
        </svg>
        <span className={`${ROTULO} text-muted-foreground`} style={{ left: pct(MARGEM.esquerda, LARGURA), top: pct(y(maximo), ALTURA), transform: "translateY(-115%)" }} aria-hidden="true">
          {formatarInteiro(maximo)} por semana
        </span>
        {viradasDeMes.map(({ i, mes }) => (
          <span key={semanas[i]} className={`${ROTULO} text-muted-foreground`} style={{ left: pct(x(i), LARGURA), top: pct(MARGEM.topo + altura, ALTURA), transform: "translateY(25%)" }} aria-hidden="true">
            {MESES[mes - 1]}
          </span>
        ))}
      </div>
      <details className="mt-2 text-[length:var(--text-caption)] text-muted-foreground">
        <summary className="cursor-pointer font-bold">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-sm text-left tabular-nums">
          <thead>
            <tr><th className="py-0.5 font-bold">Semana de</th><th className="py-0.5 text-right font-bold">{unidade}</th></tr>
          </thead>
          <tbody>
            {semanas.map((s, i) => (
              <tr key={s} className="border-t border-border"><td className="py-0.5">{diaMes(s)}/{s.slice(0, 4)}</td><td className="py-0.5 text-right">{formatarInteiro(valores[i])}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
