import { getEstadoNome } from "@/lib/br-uf"
import { classificarEspectro, rotuloClasseEspectro, type ClasseEspectro, type LinhaEspectro } from "@/lib/espectro-eleitos"
import type { Resultados1Turno } from "@/lib/resultados-1turno"
import { montarHemiciclo } from "@/lib/resultados-1turno-vista"

const NUMERO = new Intl.NumberFormat("pt-BR")

export type ClasseGrafico = ClasseEspectro | "pendente"

/** Ordem do arco e das legendas: esquerda, centro, direita; depois o que não tem classe ou eleito. */
const ORDEM: ClasseGrafico[] = ["esquerda", "centro", "direita", "sem_classificacao", "pendente"]

/** Cor por lado (tokens --espectro-*), sempre com legenda escrita e números; pendente fica cinza tracejado. */
const SVG_ESTILO: Record<ClasseGrafico, { fill: string; stroke: string; dash?: string }> = {
  esquerda: { fill: "var(--espectro-esquerda)", stroke: "var(--espectro-esquerda-contorno)" },
  centro: { fill: "var(--espectro-centro)", stroke: "var(--espectro-centro-contorno)" },
  direita: { fill: "var(--espectro-direita)", stroke: "var(--espectro-direita-contorno)" },
  sem_classificacao: { fill: "#ffffff", stroke: "var(--gray-600)" },
  pendente: { fill: "var(--gray-100)", stroke: "var(--gray-400)", dash: "2 1.5" },
}

const CSS_ESTILO: Record<ClasseGrafico, React.CSSProperties> = {
  esquerda: { background: "var(--espectro-esquerda)" },
  centro: { background: "var(--espectro-centro)" },
  direita: { background: "var(--espectro-direita)" },
  sem_classificacao: {
    backgroundColor: "#ffffff",
    backgroundImage: "repeating-linear-gradient(135deg, var(--gray-600) 0 1px, transparent 1px 4px)",
    boxShadow: "inset 0 0 0 1.5px var(--gray-600)",
  },
  pendente: { background: "var(--gray-100)", boxShadow: "inset 0 0 0 1.5px var(--gray-400)", outline: "1.5px dashed var(--gray-400)", outlineOffset: "-1.5px" },
}

export function rotuloGrafico(classe: ClasseGrafico): string {
  return classe === "pendente" ? "Ainda em disputa" : rotuloClasseEspectro(classe)
}

/** Contagem de cada classe na linha, com as vagas sem eleito como "pendente"; só o que tem cadeira. */
export function contagens(linha: LinhaEspectro): Array<{ classe: ClasseGrafico; n: number }> {
  const pendente = Math.max(0, linha.vagas - linha.eleitos)
  const valores: Record<ClasseGrafico, number> = {
    esquerda: linha.esquerda,
    centro: linha.centro,
    direita: linha.direita,
    sem_classificacao: linha.sem_classificacao,
    pendente,
  }
  return ORDEM.map((classe) => ({ classe, n: valores[classe] })).filter((c) => c.n > 0)
}

export function Amostra({ classe, tamanho = "size-3" }: { classe: ClasseGrafico; tamanho?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full ${tamanho}`} style={CSS_ESTILO[classe]} />
}

/** Título de um bloco: nome do órgão e "N de M eleitos". */
export function TituloBloco({ titulo, linha, rotulo = "eleitos", tamanho = "lg" }: { titulo: string; linha: LinhaEspectro; rotulo?: string; tamanho?: "lg" | "sm" }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className={`font-heading uppercase leading-none text-foreground ${tamanho === "lg" ? "text-[length:var(--text-heading)]" : "text-[length:var(--text-heading-sm)]"}`}>{titulo}</h3>
      <p className="text-[length:var(--text-body-sm)] font-medium tabular-nums text-muted-foreground">
        {NUMERO.format(linha.eleitos)} de {NUMERO.format(linha.vagas)} {rotulo}
      </p>
    </div>
  )
}

/** Barra empilhada e, embaixo, um número por classe em colunas iguais. */
export function BarraComNumeros({ linha, id }: { linha: LinhaEspectro; id: string }) {
  const itens = contagens(linha)
  return (
    <div data-pf-espectro-barra={id}>
      <div data-pf-revelar="auto">
        <div className="pf-barra flex h-4 w-full gap-0.5 overflow-hidden rounded-[4px] sm:h-5" aria-hidden="true">
          {itens.map(({ classe, n }) => (
            <span key={classe} className="block h-full" style={{ width: `${(n / Math.max(1, linha.vagas)) * 100}%`, ...CSS_ESTILO[classe] }} />
          ))}
        </div>
      </div>
      <dl className="mt-4 grid divide-x divide-border" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
        {itens.map(({ classe, n }) => (
          <div key={classe} className="min-w-0 px-3 first:pl-0 sm:px-4">
            <dt className="flex items-center gap-2 text-[length:var(--text-caption)] font-medium text-muted-foreground sm:text-[length:var(--text-body-sm)]">
              <Amostra classe={classe} />
              <span className="truncate">{rotuloGrafico(classe)}</span>
            </dt>
            <dd className="mt-1 font-heading text-[length:var(--text-heading-sm)] leading-none tabular-nums text-foreground sm:text-[length:var(--text-heading)]">{NUMERO.format(n)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Hemiciclo em SVG: um ponto por cadeira, da esquerda para a direita, com o total no centro. */
export function Hemiciclo({ linha, id, titulo }: { linha: LinhaEspectro; id: string; titulo: string }) {
  const itens = contagens(linha)
  const geo = montarHemiciclo(linha.vagas)
  const classes: ClasseGrafico[] = itens.flatMap(({ classe, n }) => Array<ClasseGrafico>(n).fill(classe))
  const resumo = itens.map(({ classe, n }) => `${rotuloGrafico(classe)} ${NUMERO.format(n)}`).join(", ")
  return (
    <div className="relative mx-auto w-full max-w-[560px]" data-pf-espectro-hemiciclo={id}>
      <svg viewBox={`0 0 ${geo.largura} ${geo.altura.toFixed(2)}`} className="block h-auto w-full" role="img" aria-label={`${titulo}, ${NUMERO.format(linha.vagas)} cadeiras, uma por ponto: ${resumo}.`}>
        <defs>
          <pattern id={`${id}-hachura`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill="#ffffff" />
            <line x1="0" y1="0" x2="0" y2="3" stroke="var(--gray-600)" strokeWidth="1.2" />
          </pattern>
        </defs>
        {geo.assentos.map((a, i) => {
          const classe = classes[i] ?? "pendente"
          const estilo = SVG_ESTILO[classe]
          return (
            <circle
              key={i}
              cx={a.x}
              cy={a.y}
              r={geo.raioAssento}
              fill={classe === "sem_classificacao" ? `url(#${id}-hachura)` : estilo.fill}
              stroke={estilo.stroke}
              strokeWidth={classe === "pendente" || classe === "sem_classificacao" ? Math.max(0.8, geo.raioAssento * 0.28) : Math.max(0.6, geo.raioAssento * 0.16)}
              strokeDasharray={estilo.dash}
            />
          )
        })}
      </svg>
      <p className="pointer-events-none absolute inset-x-0 bottom-0 text-center leading-none" aria-hidden="true">
        <span className="block font-heading text-[clamp(2rem,4vw,3rem)] tabular-nums text-foreground">{NUMERO.format(linha.eleitos)}</span>
        <span className="mt-1 block text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground sm:text-[length:var(--text-body-sm)]">
          de {NUMERO.format(linha.vagas)} cadeiras
        </span>
      </p>
    </div>
  )
}

/** Arco do Senado: um segmento por classe, proporcional às cadeiras, com o total no centro. */
export function ArcoSenado({ linha, id }: { linha: LinhaEspectro; id: string }) {
  const itens = contagens(linha)
  const total = Math.max(1, linha.vagas)
  const cx = 120
  const cy = 118
  const raio = 92
  const espessura = 34
  const ponto = (graus: number) => {
    const rad = (graus * Math.PI) / 180
    return `${(cx + raio * Math.cos(rad)).toFixed(2)} ${(cy - raio * Math.sin(rad)).toFixed(2)}`
  }
  const folga = itens.length > 1 ? 0.9 : 0
  const antes = itens.map((_, i) => itens.slice(0, i).reduce((soma, x) => soma + x.n, 0))
  const segmentos = itens.map(({ classe, n }, i) => {
    const inicio = 180 - (antes[i] / total) * 180
    const fim = 180 - ((antes[i] + n) / total) * 180
    const de = i === 0 ? inicio : inicio - folga
    const ate = i === itens.length - 1 ? fim : fim + folga
    return { classe, d: `M ${ponto(de)} A ${raio} ${raio} 0 0 1 ${ponto(ate)}` }
  })
  const resumo = itens.map(({ classe, n }) => `${rotuloGrafico(classe)} ${NUMERO.format(n)}`).join(", ")
  return (
    <div className="relative mx-auto w-full max-w-[340px]" data-pf-espectro-hemiciclo={id}>
      <svg viewBox="0 0 240 124" className="block h-auto w-full" role="img" aria-label={`Senado, ${NUMERO.format(linha.vagas)} cadeiras em disputa nesta eleição: ${resumo}.`}>
        {segmentos.map(({ classe, d }) => (
          <path
            key={classe}
            d={d}
            fill="none"
            stroke={SVG_ESTILO[classe].fill}
            strokeWidth={espessura}
            strokeDasharray={classe === "pendente" ? "4 3" : undefined}
          />
        ))}
      </svg>
      <p className="pointer-events-none absolute inset-x-0 bottom-0 text-center leading-none" aria-hidden="true">
        <span className="block font-heading text-[clamp(2rem,4vw,3rem)] tabular-nums text-foreground">{NUMERO.format(linha.eleitos)}</span>
        <span className="mt-1 block text-[length:var(--text-caption)] font-medium text-muted-foreground sm:text-[length:var(--text-body-sm)]">eleitos nesta eleição</span>
      </p>
    </div>
  )
}

interface GovernadorUf {
  uf: string
  classe: ClasseGrafico
  descricao: string
  /** Pendente com candidatura marcada para o 2º turno. */
  segundoTurno: boolean
}

function governadoresPorUf(data: Resultados1Turno): GovernadorUf[] {
  return data.disputas
    .filter((d) => d.cargo === "Governador")
    .map((d) => {
      // Mesma régua da contagem: fase calculada não é eleito marcado pelo TSE.
      const eleito = d.fase_calculada ? undefined : d.candidatos.find((c) => c.fase === "eleito")
      const nome = getEstadoNome(d.uf) ?? d.uf
      if (!eleito) {
        const segundoTurno = !d.fase_calculada && d.candidatos.some((c) => c.fase === "segundo_turno")
        return { uf: d.uf, classe: "pendente" as const, descricao: `${nome}: ${segundoTurno ? "2º turno em 25/10" : "sem eleito definido"}`, segundoTurno }
      }
      const classe = classificarEspectro(eleito.partido)
      return { uf: d.uf, classe, descricao: `${nome}: ${eleito.nome_urna} (${eleito.partido}), ${rotuloClasseEspectro(classe).toLowerCase()}`, segundoTurno: false }
    })
    .sort((a, b) => a.uf.localeCompare(b.uf, "pt-BR"))
}

/** Governadores por campo: uma linha por classe com a contagem e as UFs; o que segue em disputa por último. */
export function TabelaGovernadores({ linha, data }: { linha: LinhaEspectro; data: Resultados1Turno }) {
  const ufs = governadoresPorUf(data)
  const pendentes = ufs.filter((u) => u.classe === "pendente")
  // "2º turno" só quando todas as UFs pendentes têm candidatura marcada para o 2º turno.
  const todasNo2Turno = pendentes.length > 0 && pendentes.every((u) => u.segundoTurno)
  const grupos = ORDEM.map((classe) => ({ classe, ufs: ufs.filter((u) => u.classe === classe) })).filter((g) => g.ufs.length > 0)
  return (
    <div className="min-w-0" data-pf-espectro-governadores>
      <TituloBloco titulo="Governadores" linha={{ ...linha, vagas: ufs.length, eleitos: ufs.length - pendentes.length }} rotulo="definidos" tamanho="sm" />
      <ul className="mt-3 border-t border-border">
        {grupos.map(({ classe, ufs: lista }) => (
          <li
            key={classe}
            className={`grid grid-cols-[1rem_minmax(0,1fr)_2rem] items-center gap-x-3 gap-y-1 border-b border-border px-1 py-2.5 sm:grid-cols-[1rem_10.5rem_2rem_minmax(0,1fr)] ${classe === "pendente" ? "bg-[var(--gray-50)]" : ""}`}
          >
            <Amostra classe={classe} tamanho="size-3.5" />
            <span className="text-[length:var(--text-body-sm)] font-medium text-foreground">
              {classe === "pendente" ? (todasNo2Turno ? "Em disputa (2º turno)" : "Ainda sem eleito") : rotuloGrafico(classe)}
            </span>
            <span className="text-right font-heading text-[length:var(--text-heading-sm)] leading-none tabular-nums text-foreground">{lista.length}</span>
            <span className="col-span-3 text-[length:var(--text-caption)] font-medium tracking-wide text-muted-foreground sm:col-span-1 sm:border-l sm:border-border sm:pl-3 sm:text-[length:var(--text-body-sm)]">
              {lista.map((u, i) => (
                <span key={u.uf} title={u.descricao}>
                  {i > 0 && " · "}
                  <abbr title={u.descricao} className="no-underline">{u.uf}</abbr>
                  <span className="sr-only"> ({u.descricao})</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {todasNo2Turno && (
        <p className="mt-2 text-[length:var(--text-caption)] font-medium text-muted-foreground">
          2º turno em 25/10 · {pendentes.length} {pendentes.length === 1 ? "governo ainda em disputa" : "governos ainda em disputa"}.
        </p>
      )}
    </div>
  )
}

/** Legenda única do topo: só as classes que aparecem em algum bloco. */
export function LegendaEspectro({ classes }: { classes: ClasseGrafico[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[length:var(--text-body-sm)] font-medium text-foreground" aria-label="Legenda">
      {ORDEM.filter((c) => classes.includes(c)).map((classe) => (
        <li key={classe} className="inline-flex items-center gap-2">
          <Amostra classe={classe} tamanho="size-3.5" />
          {rotuloGrafico(classe)}
        </li>
      ))}
    </ul>
  )
}
