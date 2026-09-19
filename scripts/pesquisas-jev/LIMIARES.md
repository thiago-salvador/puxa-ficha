# Limiares fixados em 19/09/2026, ANTES de rodar o holdout

- `atribuicao` >= 0,80 -> aceita o par
- `atribuicao` <= 0,20 -> descarta o par
- entre 0,20 e 0,80 -> revisao humana, nunca decide sozinho
- `medida` so decide com confidence >= 0,60; abaixo disso vai a revisao
- `disputa_alvo` <= 0,20 -> exclui o par do cenario coletado

## Criterio de aceite escrito antes da medicao

1. `atribuicao`: acuracia >= 0,90 na faixa decidida.
2. `medida`: **zero contaminacao**, isto e, nenhum par cujo rotulo seja rejeicao,
   avaliacao de gestao ou segundo turno pode ser previsto como intencao de voto
   de primeiro turno. Este e o risco que motiva a proposta inteira.
3. `disputa_alvo`: zero falso positivo.

## Endurecimento prospectivo da composição, ainda sem novo holdout

Estes gates foram acrescentados após as medições acima. Os resultados históricos
não validam sua cobertura; a composição continua somente em sombra.

- `disputa_alvo` >= 0,80 -> pode entrar; toda a faixa intermediária fica fora do cenário.
- `recorte` deve ser exatamente `geral`, com confidence >= 0,60; subgrupo,
  votos válidos, não aplicável, ausência ou confidence abaixo disso bloqueiam.
- `revisao_humana` > 0,20 -> bloqueia o par; só <= 0,20 pode seguir.
- Scores ausentes, não numéricos ou fora de [0, 1] bloqueiam o par.

## Defeito corrigido na v3 (era v2), com holdout proprio

`atribuicao` acumula duas perguntas diferentes: "de quem e este numero" e "este
numero e do levantamento atual". O unico erro do holdout
(`datafolha-ce-ce-04292-2026#8`, p=0,95 contra rotulo 0) e uma frase que atribui
mesmo 47% a Ciro Gomes, so que numa pesquisa anterior de marco. Pela letra da
pergunta o modelo esta certo e o rotulo carrega criterio que a pergunta nao faz.

Corrigido na v3: `atribuicao` perdeu a clausula de pesquisa anterior e nasceu a
pergunta `atualidade`. Como isso muda o conjunto de perguntas, a v3 foi medida
em holdout NOVO, nunca usado para ajustar nada:

- `golden-holdout2.json`, recorte `holdout2-veiculos`: 39 pares de CINCO
  veiculos que nao apareciam ate entao (Exame, Gazeta do Povo, RIC, R7),
  instituto Real Time Big Data.
- recorte `holdout2-atualidade`: 12 pares, 6 deles de frases que citam
  levantamento anterior, que e o caso negativo que faltava.

`atualidade` nao tem caso negativo no recorte de veiculos, e por isso ela e
medida no recorte proprio. Dizer "validada" sem isso seria repetir o furo que
esta medicao existe para fechar.
