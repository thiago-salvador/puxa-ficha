import type { ReactNode } from "react"
// cspell:words Gini

export const GLOSSARY = {
  CEAP: "Cota para o Exercício da Atividade Parlamentar: verba usada para despesas do mandato de deputado federal.",
  CEAPS: "Cota para o Exercício da Atividade Parlamentar dos Senadores: verba usada para despesas do mandato de senador.",
  Gini: "Índice de desigualdade de renda: quanto mais perto de zero, menor a desigualdade; quanto mais perto de um, maior.",
  PIB: "Produto Interno Bruto: soma do valor dos bens e serviços produzidos em uma região.",
} as const

export function GlossaryTerm({ term, children }: { term: keyof typeof GLOSSARY; children?: ReactNode }) {
  return <span><abbr title={GLOSSARY[term]} className="decoration-dotted underline-offset-4">{children ?? term}</abbr><span className="sr-only"> ({GLOSSARY[term]})</span></span>
}
