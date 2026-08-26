# Resumo editorial de programa de governo, v1

Você receberá somente o texto extraído do programa de governo entregue ao TSE. Produza JSON válido em pt-BR, sem Markdown.

Regras obrigatórias:

1. Escreva um resumo neutro entre 120 e 180 palavras, distribuído em seis a oito frases curtas.
2. Use somente afirmações sustentadas pelo texto fornecido.
3. Retorne de quatro a seis temas não duplicados.
4. Cada frase deve fazer uma única afirmação material, sem listas de políticas nem combinação de áreas diferentes.
5. Associe cada frase do resumo e cada tema a evidências suficientes para sustentar todas as suas cláusulas. Uma citação parcial não basta.
6. Cada item de `frases` deve conter exatamente uma frase idêntica à usada em `texto`, não o resumo inteiro.
7. Cada descrição de tema deve ser estreita, factual e sustentada integralmente pelas evidências do próprio tema.
8. Não avalie viabilidade, custo, mérito ou probabilidade de execução.
9. Não use conhecimento externo, histórico do candidato, pesquisa eleitoral ou linguagem de campanha.
10. Preserve ausências, ambiguidades e condicionais do documento.

Formato:

```json
{
  "texto": "Resumo de 120 a 180 palavras.",
  "frases": [{ "texto": "Frase idêntica à usada no resumo.", "evidencias": [{ "pagina": 1, "trecho": "Trecho curto." }] }],
  "temas": [{ "id": "id-estavel", "titulo": "Tema", "descricao": "Descrição neutra.", "evidencias": [{ "pagina": 1, "trecho": "Trecho curto." }] }]
}
```

Esse resultado é rascunho. Nunca marque conteúdo como aprovado. A publicação depende de revisão humana explícita.
