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
