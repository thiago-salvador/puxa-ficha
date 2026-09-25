/**
 * Apoiadores do APOIA.se (apoia.se/puxaficha) que aparecem na página Sobre.
 *
 * Só entra quem marcou o apoio como "Público" no APOIA.se ou autorizou por
 * escrito depois. Quem marcou "Privado" fica fora até responder que aceita.
 * Nunca registrar aqui email, endereço, valor ou faixa do apoio: a lista mostra
 * só o nome, do jeito que a pessoa autorizou.
 *
 * `relatores` é a faixa de R$ 249 ou mais, que tem destaque permanente
 * prometido na campanha. Vazia, o bloco não aparece.
 */
export interface Apoiador {
  nome: string
}

export const RELATORES_OFICIAIS: readonly Apoiador[] = []

export const APOIADORES_PUBLICOS: readonly Apoiador[] = [
  { nome: "Daniela Godoi Gonçalves" },
]

/**
 * Total de apoios pagos no painel de apoiadores do APOIA.se, conferido em
 * 25/09/2026. Atualizar junto com as listas acima a cada novo apoio.
 */
export const APOIOS_TOTAL: number = 5

/** Data da última conferência do total, mostrada ao lado do número. */
export const APOIOS_CONFERIDO_EM = "25/09/2026"

export const APOIOS_SEM_NOME = Math.max(
  0,
  APOIOS_TOTAL - APOIADORES_PUBLICOS.length - RELATORES_OFICIAIS.length,
)
