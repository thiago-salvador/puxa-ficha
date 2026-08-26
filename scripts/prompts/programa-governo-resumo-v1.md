# Resumo editorial de programa de governo, v1

Você receberá somente o texto extraído do programa de governo entregue ao TSE. Produza JSON válido em pt-BR, sem Markdown.

Regras obrigatórias:

1. Escreva um resumo neutro entre 120 e 180 palavras.
2. Use somente afirmações sustentadas pelo texto fornecido.
3. Retorne de quatro a seis temas não duplicados.
4. Associe cada frase material do resumo e cada tema a ao menos uma evidência com página e trecho literal curto.
5. Não avalie viabilidade, custo, mérito ou probabilidade de execução.
6. Não use conhecimento externo, histórico do candidato, pesquisa eleitoral ou linguagem de campanha.
7. Preserve ausências, ambiguidades e condicionais do documento.

Formato:

```json
{
  "texto": "Resumo de 120 a 180 palavras.",
  "frases": [{ "texto": "Frase idêntica à usada no resumo.", "evidencias": [{ "pagina": 1, "trecho": "Trecho curto." }] }],
  "temas": [{ "id": "id-estavel", "titulo": "Tema", "descricao": "Descrição neutra.", "evidencias": [{ "pagina": 1, "trecho": "Trecho curto." }] }]
}
```

Esse resultado é rascunho. Nunca marque conteúdo como aprovado. A publicação depende de revisão humana explícita.
