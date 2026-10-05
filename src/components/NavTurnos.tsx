import Link from "next/link"

const ROTAS = { 1: "/", 2: "/2o-turno" } as const
const ROTULOS = { 1: "1º Turno", 2: "2º Turno" } as const

/**
 * Faixa de navegação entre os turnos, um em cada ponta (como a antiga faixa
 * Presidenciáveis | Governadores): 1º Turno à esquerda, 2º Turno à direita. O
 * turno atual é o título da página; o outro é link.
 */
export function NavTurnos({ atual, titulo = "h1" }: { atual: 1 | 2; titulo?: "h1" | "h2" }) {
  const Titulo = titulo
  const tamanho = { fontSize: "clamp(36px, 7vw, 72px)" }
  const item = (turno: 1 | 2) =>
    turno === atual ? (
      <Titulo
        key={turno}
        className="font-heading uppercase leading-none text-foreground [text-wrap:balance]"
        style={tamanho}
      >
        <span className="sr-only">Resultado do </span>
        {ROTULOS[turno]}
      </Titulo>
    ) : (
      <Link
        key={turno}
        href={ROTAS[turno]}
        className="font-heading uppercase leading-none text-[var(--gray-500)] transition-colors duration-200 hover:text-foreground focus-visible:text-foreground"
        style={tamanho}
      >
        {ROTULOS[turno]}
      </Link>
    )
  return (
    <nav aria-label="Turnos da eleição" data-pf-nav-turnos={atual}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        {item(1)}
        {item(2)}
      </div>
    </nav>
  )
}
