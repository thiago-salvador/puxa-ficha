import { getEstadoNome } from "@/lib/br-uf"
import { classificarEspectro, rotuloClasseEspectro, type ClasseEspectro, type LinhaEspectro } from "@/lib/espectro-eleitos"
import type { Resultados1Turno } from "@/lib/resultados-1turno"
import { montarHemiciclo } from "@/lib/resultados-1turno-vista"

const NUMERO = new Intl.NumberFormat("pt-BR")

/** Ordem do arco e das legendas: esquerda, centro, direita; depois o que não tem classe ou eleito. */
export type ClasseGrafico = ClasseEspectro | "pendente"

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
  esquerda: { background: "var(--espectro-esquerda)", border: "1.5px solid var(--espectro-esquerda-contorno)" },
  centro: { background: "var(--espectro-centro)", border: "1.5px solid var(--espectro-centro-contorno)" },
  direita: { background: "var(--espectro-direita)", border: "1.5px solid var(--espectro-direita-contorno)" },
  sem_classificacao: {
    backgroundColor: "#ffffff",
    backgroundImage: "repeating-linear-gradient(135deg, var(--gray-600) 0 1px, transparent 1px 4px)",
    border: "1.5px solid var(--gray-600)",
  },
  pendente: { background: "var(--gray-100)", border: "1.5px dashed var(--gray-400)" },
}

function rotuloGrafico(classe: ClasseGrafico): string {
  return classe === "pendente" ? "Ainda sem eleito" : rotuloClasseEspectro(classe)
}

function contagens(linha: LinhaEspectro): Array<{ classe: ClasseGrafico; n: number }> {
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

export function Amostra({ classe, forma = "circulo" }: { classe: ClasseGrafico; forma?: "circulo" | "quadrado" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-3 shrink-0 ${forma === "circulo" ? "rounded-full" : "rounded-[2px]"}`}
      style={CSS_ESTILO[classe]}
    />
  )
}

function Legenda({ itens, forma }: { itens: Array<{ classe: ClasseGrafico; n: number; extra?: string }>; forma?: "circulo" | "quadrado" }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[length:var(--text-caption)] font-medium text-foreground">
      {itens.map(({ classe, n, extra }) => (
        <li key={classe} className="inline-flex items-center gap-1.5">
          <Amostra classe={classe} forma={forma} />
          <span>
            {rotuloGrafico(classe)} <span className="font-bold tabular-nums">{NUMERO.format(n)}</span>
            {extra ? <span className="text-muted-foreground"> {extra}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

function TituloGrafico({ titulo, linha }: { titulo: string; linha: LinhaEspectro }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h3 className="font-heading text-xl uppercase leading-tight text-foreground">{titulo}</h3>
      <p className="text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground">
        {NUMERO.format(linha.eleitos)} de {NUMERO.format(linha.vagas)} eleitos
      </p>
    </div>
  )
}

/** Hemiciclo em SVG: um ponto por cadeira, da esquerda para a direita. */
export function Hemiciclo({ titulo, linha, id }: { titulo: string; linha: LinhaEspectro; id: string }) {
  const itens = contagens(linha)
  const geo = montarHemiciclo(linha.vagas)
  const classes: ClasseGrafico[] = itens.flatMap(({ classe, n }) => Array<ClasseGrafico>(n).fill(classe))
  return (
    <figure className="min-w-0 space-y-3" data-pf-espectro-hemiciclo={id} aria-labelledby={`${id}-legenda`}>
      <TituloGrafico titulo={titulo} linha={linha} />
      <div className="relative mx-auto w-full max-w-[520px]">
        <svg viewBox={`0 0 ${geo.largura} ${geo.altura.toFixed(2)}`} className="block h-auto w-full" aria-hidden="true">
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
                // Borda preta fina nas cadeiras eleitas: separa vizinhas da mesma cor sem cobrir a cor.
                strokeWidth={classe === "pendente" || classe === "sem_classificacao" ? Math.max(0.8, geo.raioAssento * 0.28) : Math.max(0.6, geo.raioAssento * 0.16)}
                strokeDasharray={estilo.dash}
              />
            )
          })}
        </svg>
        <p className="pointer-events-none absolute inset-x-0 bottom-0 text-center leading-none">
          <span className="block font-heading text-3xl tabular-nums text-foreground sm:text-4xl">{NUMERO.format(linha.eleitos)}</span>
          <span className="text-[length:var(--text-caption)] font-medium tabular-nums text-muted-foreground">
            de {NUMERO.format(linha.vagas)} cadeiras
          </span>
        </p>
      </div>
      <figcaption id={`${id}-legenda`} className="space-y-1">
        <span className="sr-only">
          {titulo}, {NUMERO.format(linha.vagas)} cadeiras, uma por ponto, ordenadas da esquerda para a direita:
        </span>
        <Legenda itens={itens} />
      </figcaption>
    </figure>
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
  const lista = data.disputas
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
      return {
        uf: d.uf,
        classe,
        descricao: `${nome}: ${eleito.nome_urna} (${eleito.partido}), ${rotuloClasseEspectro(classe).toLowerCase()}`,
        segundoTurno: false,
      }
    })
  return lista.sort((a, b) => ORDEM.indexOf(a.classe) - ORDEM.indexOf(b.classe) || a.uf.localeCompare(b.uf, "pt-BR"))
}

/** Governadores: um quadrado por UF, na ordem esquerda, centro, direita; 2º turno tracejado. */
export function QuadradosGovernadores({ linha, data }: { linha: LinhaEspectro; data: Resultados1Turno }) {
  const ufs = governadoresPorUf(data)
  // "(2º turno)" só quando todas as UFs pendentes têm candidatura marcada para o 2º turno.
  const pendentes = ufs.filter((u) => u.classe === "pendente")
  const todasNo2Turno = pendentes.length > 0 && pendentes.every((u) => u.segundoTurno)
  const itens = ORDEM.map((classe) => ({
    classe,
    n: ufs.filter((u) => u.classe === classe).length,
    extra: classe === "pendente" && todasNo2Turno ? "(2º turno)" : undefined,
  })).filter((i) => i.n > 0)
  return (
    <figure className="min-w-0 space-y-3" data-pf-espectro-governadores aria-labelledby="espectro-gov-legenda">
      <TituloGrafico titulo="Governadores" linha={linha} />
      <ol className="flex flex-wrap gap-1.5" aria-label="Governadores por estado">
        {ufs.map((u) => (
          <li key={u.uf} className="flex w-8 flex-col items-center gap-1" title={u.descricao}>
            <span aria-hidden="true" className="block size-8 rounded-[4px]" style={CSS_ESTILO[u.classe]} />
            <span aria-hidden="true" className="text-[length:var(--text-eyebrow)] font-bold leading-none text-muted-foreground">
              {u.uf}
            </span>
            <span className="sr-only">{u.descricao}</span>
          </li>
        ))}
      </ol>
      <figcaption id="espectro-gov-legenda">
        <Legenda itens={itens} forma="quadrado" />
      </figcaption>
    </figure>
  )
}

/** Assembleias: barra empilhada (mais de mil cadeiras não cabem em pontos legíveis). */
export function BarraEspectro({ titulo, linha, id }: { titulo: string; linha: LinhaEspectro; id: string }) {
  const itens = contagens(linha)
  return (
    <figure className="min-w-0 space-y-3" data-pf-espectro-barra={id} aria-labelledby={`${id}-legenda`}>
      <TituloGrafico titulo={titulo} linha={linha} />
      <div data-pf-revelar="auto">
        <div className="pf-barra flex h-6 w-full gap-px overflow-hidden rounded-[6px]" aria-hidden="true">
          {itens.map(({ classe, n }) => (
            <span
              key={classe}
              className="block h-full first:rounded-l-[6px] last:rounded-r-[6px]"
              style={{ width: `${(n / Math.max(1, linha.vagas)) * 100}%`, ...CSS_ESTILO[classe] }}
            />
          ))}
        </div>
      </div>
      <figcaption id={`${id}-legenda`}>
        <span className="sr-only">{titulo}, {NUMERO.format(linha.vagas)} cadeiras:</span>
        <Legenda itens={itens} />
      </figcaption>
    </figure>
  )
}
