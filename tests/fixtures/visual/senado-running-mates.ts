// Fixtures exclusively for CI visual builds. These names are synthetic.
export interface SenadoRunningMate {
  ordem: 1 | 2
  nome_urna: string
  situacao: string | null
  fonte_url: string
  sq_candidato: string
}

const MATES: Record<string, SenadoRunningMate[]> = {
  "fixture-senado-alfa": [
    { ordem: 1, nome_urna: "Fixture Suplente Alfa 1", situacao: "titular", fonte_url: "https://www.tse.jus.br/", sq_candidato: "fixture-suplente-alfa-1" },
    { ordem: 2, nome_urna: "Fixture Suplente Alfa 2", situacao: "titular", fonte_url: "https://www.tse.jus.br/", sq_candidato: "fixture-suplente-alfa-2" },
  ],
  "fixture-senado-beta": [
    { ordem: 1, nome_urna: "Fixture Suplente Beta 1", situacao: "titular", fonte_url: "https://www.tse.jus.br/", sq_candidato: "fixture-suplente-beta-1" },
    { ordem: 2, nome_urna: "Fixture Suplente Beta 2", situacao: "titular", fonte_url: "https://www.tse.jus.br/", sq_candidato: "fixture-suplente-beta-2" },
  ],
}

export async function loadSenadoRunningMates(
  slugs: string[],
  uf: string,
): Promise<{ data: Record<string, SenadoRunningMate[]>; absence: Record<string, never>; unavailable: boolean }> {
  if (uf.toUpperCase() === "RJ") return { data: {}, absence: {}, unavailable: true }
  return { data: Object.fromEntries(slugs.flatMap((slug) => MATES[slug] ? [[slug, MATES[slug]]] : [])), absence: {}, unavailable: false }
}
