// Séries por semana da home do arquivo. Semana de segunda a domingo no horário de Brasília (UTC-3, sem
// horário de verão em 2026). Separado de numeros-arquivo.ts para ser testado sem o export do banco.

/** Data no fuso de Brasília, em AAAA-MM-DD. */
export const diaEmBrasilia = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10)

/** Segunda-feira (Brasília) da semana da data, em AAAA-MM-DD. */
export function semanaDe(iso: string): string {
  const dia = new Date(`${diaEmBrasilia(iso)}T00:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7))
  return dia.toISOString().slice(0, 10)
}

/** Contagem por semana, de `inicio` até `fim` (inclusive), com zero nas semanas sem registro. */
export function porSemana(datas: string[], inicio: string, fim: string): { semanas: string[]; valores: number[] } {
  const contagem = new Map<string, number>()
  for (const d of datas) contagem.set(semanaDe(d), (contagem.get(semanaDe(d)) ?? 0) + 1)
  const semanas: string[] = []
  for (let s = new Date(`${semanaDe(inicio)}T00:00:00Z`); s.toISOString().slice(0, 10) <= semanaDe(fim); s.setUTCDate(s.getUTCDate() + 7)) {
    semanas.push(s.toISOString().slice(0, 10))
  }
  return { semanas, valores: semanas.map((s) => contagem.get(s) ?? 0) }
}
