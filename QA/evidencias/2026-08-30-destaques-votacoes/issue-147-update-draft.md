# Draft de atualização da issue #147

Não publicado automaticamente.

Recoleta oficial concluída para as 23 votações e os 154 pares monitorados, com duas
execuções independentes, payload bruto persistido, URL, timestamp real e SHA-256.
Os hashes de fonte, votação e par coincidiram entre as execuções.

Resultado:

- 151 pares coincidiram diretamente com a superfície anterior;
- JHC divergiu porque a fonte oficial registra `Artigo 17`; a correção está no PR #152;
- os pares de Flávio Bolsonaro e João Rodrigues não apareceram no recorte oficial e
  ficam fora da superfície na migration proposta;
- três dos cinco registros sem metadados receberam ID oficial;
- dois eventos históricos continuam sem ID nominal estável no arquivo oficial;
- as 181 linhas sintéticas antigas são preservadas como histórico e supersedidas por
  155 receipts sob o contrato `provenance_v1`.

O contrato e as evidências estão no PR #154. A migration reconciliadora está em PR
draft separado e ainda não foi aplicada. A issue não deve ser fechada antes da
autorização nomeada, aplicação, readback de produção e confirmação do gate strict.
