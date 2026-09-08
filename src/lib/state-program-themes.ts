// Display taxonomy of reviewed IDs. Original theme wording and evidence remain visible.
export const STATE_PROGRAM_CORE_THEMES = [["seguranca", "Segurança"], ["saude", "Saúde"], ["educacao", "Educação"], ["clima", "Clima"]] as const
const GROUPS: Record<string, { id: string; title: string }> = {
  "seguranca-publica": { id: "seguranca", title: "Segurança" },
  "integracao-policial": { id: "seguranca", title: "Segurança" },
  "cameras-corporais": { id: "seguranca", title: "Segurança" },
  saude: { id: "saude", title: "Saúde" },
  "saude-publica": { id: "saude", title: "Saúde" },
  "fila-da-saude": { id: "saude", title: "Saúde" },
  educacao: { id: "educacao", title: "Educação" },
  "educacao-publica": { id: "educacao", title: "Educação" },
  "ensino-profissional": { id: "educacao", title: "Educação" },
  clima: { id: "clima", title: "Clima e ambiente" },
  "adaptacao-climatica": { id: "clima", title: "Clima e ambiente" },
  "meio-ambiente": { id: "clima", title: "Clima e ambiente" },
  "mudancas-climaticas": { id: "clima", title: "Clima e ambiente" },
}
export function stateProgramTheme(theme: { id: string; titulo: string }) {
  return GROUPS[theme.id] ?? { id: theme.id, title: theme.titulo }
}
