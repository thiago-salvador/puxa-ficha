# Promessa x evidência: rubrica, regra e critério de aceite

Escrito em 22/09/2026, **antes de rotular o golden e antes da primeira rodada do Jev**.
O Jev roda só em sombra: nenhuma linha de `compromisso_evidencia` vira
`verificado` sem revisão humana, passe ou não este critério.

## Rubrica de rótulo (vale para o golden e para a revisão)

O par é um tema do programa de governo (título, descrição e trecho da página do
documento oficial) e uma evidência do mesmo candidato. O rótulo diz se a
evidência trata do **mesmo compromisso concreto** e em que direção. Não diz se o
compromisso foi cumprido.

| Rótulo | Quando |
|---|---|
| `sustenta` | A evidência mostra o candidato agindo ou se posicionando na mesma direção do compromisso concreto: votou a favor de medida que o realiza, é autor de proposição que o implementa, declarou a mesma posição, fala defendendo a mesma medida. |
| `contradiz` | A evidência vai na direção oposta ao compromisso concreto: votou contra medida que o realiza, defendeu o contrário, propôs o inverso. |
| `relacionada` | Trata do mesmo assunto concreto do compromisso, sem direção clara a favor ou contra: fala descritiva, proposição sobre aspecto vizinho do mesmo objeto, voto cuja relação com o compromisso depende de interpretação. |
| `nao_relacionada` | Assunto diferente, ou só divide a área ampla (saúde, economia, segurança) sem tratar do mesmo objeto do compromisso. |

Na dúvida entre `relacionada` e `nao_relacionada`, o rótulo é `nao_relacionada`
quando o leitor precisaria de explicação externa para ver a ligação.

Esclarecimento acrescentado durante a rotulagem, antes da primeira rodada do Jev:
o assunto do tema é o que o **título** nomeia. Tema de título amplo ("Segurança
pública", "Economia, política fiscal e industrial") aceita como `relacionada`
evidência claramente dentro desse assunto, mesmo sem tratar da medida descrita.
Tema de título estreito ("Saúde digital", "Orçamento participativo") não aceita
evidência que só divide a área maior. Mesma direção com medida diferente é
`relacionada`, não `sustenta`.

## Perguntas e regra de decisão (v1)

Numa só request por par:

- `relacao` (Choice): `sustenta`, `contradiz`, `relacionada`, `nao_relacionada`.
- `mesmo_compromisso` (Noul): a evidência trata do mesmo compromisso concreto.

Regra em código, sobre as probabilidades:

- **Descarte automático**: `relacao` com maior probabilidade em
  `nao_relacionada` e p >= 0,80, **e** `mesmo_compromisso` <= 0,20. O par sai da
  fila de revisão e fica só no log de sombra.
- Todo o resto vai para a fila de revisão com o pré-rótulo de maior
  probabilidade. Quem decide é o revisor.
- `contradiz` nunca é descartado e nunca é publicado na v1: fica na fila.

Ajuste permitido: no máximo 3 iterações de perguntas e limiares contra o
conjunto de ajuste. O holdout roda uma vez por versão; mudar pergunta ou
limiar depois de olhar o holdout exige holdout novo.

## Critério de aceite no holdout (30 pares, ids disjuntos do ajuste)

1. **Classe prioritária, segurança do descarte.** Nenhum par rotulado
   `sustenta` ou `contradiz` pode ser descartado automaticamente, e no máximo
   1 par rotulado `relacionada` pode ser descartado.
2. **Utilidade do descarte.** O descarte automático cobre ao menos 40% dos
   pares rotulados `nao_relacionada`.
3. **Pré-rótulo.** Concordância binária (relacionado, isto é `sustenta`,
   `contradiz` ou `relacionada`, contra `nao_relacionada`) de pelo menos 0,80.
   Concordância por classe é registrada, sem mínimo.

Resultado:

- 1, 2 e 3 atingidos: o Jev pode triar a fila (descartar e pré-rotular).
- 1 falha: o Jev não descarta nada; a fila recebe todos os pares.
- 2 ou 3 falham com 1 atingido: o Jev só pode ser usado como ordenação da fila,
  sem descarte.

Toda divergência entre rótulo e Jev é classificada em: ruído de rótulo, erro do
Jev, state insuficiente, erro de código ou falha de serviço.
