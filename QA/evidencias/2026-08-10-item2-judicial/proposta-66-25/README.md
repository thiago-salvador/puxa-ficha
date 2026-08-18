# Proposta judicial procedural, 66 processos em 25 fichas

Pacote local e não aplicado gerado da reconsulta integral da API pública do
DJEN. Ele é complementar ao lote 69/21 e usa marcador, timestamp, allowlist,
rollback e readback próprios.

Cada descrição é composta somente de campos oficiais: CNJ, classes, tribunais,
órgãos, polos literais, tipos e datas das comunicações. O status público afirma
apenas que existe comunicação processual publicada e que o mérito não foi
inferido. `data_inicio`, `data_decisao` e `gravidade` ficam nulos.

O contrato de UI trata essas linhas como `Comunicações processuais`: não as
promove no contador criminal, não mostra badge de gravidade, não inventa
intervalo na timeline e mantém a fonte oficial no DTO e no DOM.

Estado: aprovado editorialmente em 11/08/2026 e promovido ao caminho aplicável
local. A migration não foi aplicada e a decisão não autoriza merge, deploy ou
publicação.
