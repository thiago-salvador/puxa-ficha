// State do Jev para um par compromisso x evidência. Só trechos decisivos: título,
// descrição e até dois trechos de página do tema, frases do resumo ligadas ao
// tema e os campos da fonte da evidência. Nada de página inteira.
const TIPOS = {
  votacao_chave: "voto nominal do candidato em votação do Congresso",
  projeto_lei: "proposição de lei de autoria do candidato",
  posicao_declarada: "posição do candidato registrada com fonte",
  fala: "citação literal do candidato publicada pela imprensa",
  contradicao: "contradição registrada e verificada na ficha do candidato",
}

export const POLITICAS = [
  "A relação é entre a evidência e o compromisso do tema; não se avalia se o compromisso foi cumprido.",
  "O assunto do tema é o que o título nomeia. Tema de título amplo aceita evidência claramente dentro desse assunto; tema de título estreito não aceita evidência que só divide a área maior.",
  "Mesma direção com medida diferente é relação, não sustentação.",
  "Na dúvida, se o leitor precisaria de explicação externa para ver a ligação, a evidência não é relacionada.",
]

const corta = (texto, limite) => {
  const limpo = String(texto ?? "").replace(/\s+/gu, " ").trim()
  return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo
}

export function estadoDoPar(par) {
  const conteudo = {}
  for (const [chave, valor] of Object.entries(par.evidencia.conteudo)) {
    if (valor === null || valor === "" || valor === false) continue
    conteudo[chave] = typeof valor === "string" ? corta(valor, 600) : valor
  }
  return {
    compromisso: {
      cargo_disputado: par.cargo === "PRESIDENTE" ? "Presidente da República" : "Governador",
      titulo: par.compromisso.titulo,
      descricao: par.compromisso.descricao,
      trechos_do_programa: par.compromisso.evidencias.slice(0, 2).map((e) => ({ pagina: e.pagina, trecho: corta(e.trecho, 400) })),
      frases_do_resumo: par.compromisso.frases.map((f) => f.texto),
    },
    evidencia: {
      tipo: TIPOS[par.evidencia.tipo],
      data: par.evidencia.data,
      conteudo,
    },
    politicas: POLITICAS,
  }
}
