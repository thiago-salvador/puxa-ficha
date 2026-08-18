# Adendo de DoD: invariantes globais da classificação (Trilha A e Fase 4)

Emitido pela Sessão Raiz em 09/08/2026, depois de as quatro trilhas abrirem em
`21a83dd`. Motivo: a DoD da Trilha A no contrato v2 exige provar os 5 cenários
nomeados (Lula, Daciolo, Flávio, Renan, Zema), enquanto o método manda auditar a
base inteira. Uma entrega poderia fechar os 5 verdes sem apresentar o resultado
da auditoria global e formalmente cumprir a DoD. Este adendo fecha esse buraco.
A nota original trouxe exemplos individuais pedindo solução global; a DoD
precisa medir o global, não o exemplo.

## O que muda para a Trilha A

À DoD existente soma-se, por regra, uma **contagem sobre a base inteira**, com a
query de readback que a produz registrada na entrega. No Postgres efêmero do
dry-run, depois de forward:

| Invariante | Valor exigido |
|---|---|
| Registros de candidatura indeferida/cancelada exibidos como candidatura real (o defeito do item 12) | contagem antes > 0 documentada, contagem depois = **0** |
| Linhas cujo raw diz ELEITO (inclusive por QP/média) exibidas como "Não Eleito" (itens 5 e 10) | **0** depois |
| Cargos internos de partido presentes na timeline eleitoral (item 13) | **0** depois |
| Registros de eleição em ano ímpar, em qualquer superfície (item 15) | **0** depois |
| Mandatos sobrepostos para a mesma pessoa sem regra de precedência aplicada (item 10) | **0** depois |

Regra de forma: cada invariante entrega três coisas, a query, a contagem antes
e a contagem depois. Contagem "antes" serve para provar que a query enxerga o
defeito (query que retorna 0 antes e 0 depois não provou nada). Se uma regra
não tiver caso na base além do nomeado, o antes = 1 é registrado como tal, sem
constrangimento: o ponto é medir, não inflar.

Os 5 cenários nomeados continuam obrigatórios como reprodução dos prints. Eles
são o critério de reprodução, não o limite do fix.

## O que muda para a Fase 4 (obrigação da Raiz, não das trilhas)

No readback final contra produção, depois da aplicação e da re-materialização,
a Raiz re-executa **as mesmas queries** dos invariantes acima e exige os mesmos
zeros. O passe transversal por amostra do contrato v2 continua existindo, mas
deixa de ser a única cobertura do universo: amostra confere superfície
renderizada, invariante confere a base inteira.

As linhas do gate de 20 linhas que citam itens de classificação (5, 10, 12, 13,
15) só ficam verdes com o par: cenário do print reproduzido resolvido E
invariante global zerado em produção.

## O que NÃO muda

- DoD das Trilhas B, C e D: já medem o global por construção (universo com
  contagens no dry-run da B, contagem de fichas antes/depois na C, componente
  compartilhado na D).
- Propriedade de arquivos, gate de allowlist, proibições e o fluxo serial da
  Fase 3.

## Como este adendo chega na Trilha A

As trilhas ramificaram do SHA `21a83dd`; este commit é posterior e não aparece
nos worktrees delas. A Sessão A recebe o conteúdo por prompt do Thiago, e a
conformidade é conferida pela Raiz na integração da Fase 2, contra este arquivo
no branch `base-lancamento`.
