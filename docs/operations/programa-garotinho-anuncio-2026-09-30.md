# Programa de Garotinho: anúncio oficial sem PDF no pacote

A DivulgaCandContas passou a listar o arquivo `190017144019`, tipo `5`, para a
candidatura de Garotinho ao governo do RJ (`190002550196`). A consulta HTTP 200
de 30/09/2026 às 11:24:01.355 UTC está preservada no artefato da
[auditoria do GitHub Actions](https://github.com/thiago-salvador/puxa-ficha/actions/runs/36708154014).
A [fonte específica do TSE](https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RJ/20322002026/candidato/190002550196)
retornou o nome `pje-Programa de Governo - Anthony Garotinho2027.pdf`.
`payloadSha256` é o SHA-256 da resposta JSON bruta preservada:
`dfc4d71a8281169719cb43eb899ee47efe132fe81217669282ee55ed80d56cca`.
Nenhum hash deste registro representa bytes do PDF.

As execuções da mesma auditoria em 28/09 (18:44 UTC) e 29/09 (17:01 UTC)
terminaram com o monitor em `ok` e sem esse arquivo. O anúncio é, portanto,
posterior a 29/09 17:01 UTC.

## Pacote oficial

O [pacote de propostas do RJ](https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_RJ.zip),
baixado em 30/09/2026 com HTTP 200, tem `Last-Modified` de
`2026-09-29T06:48:46Z`, 12.651.416 bytes e SHA-256
`2bc1d76d697ed9f7595a77541e12dc1d5b468576e05392c714694bf90eb4ad7f`.
Ele contém nove propostas e `leiame.pdf`, e nenhum
`RJ/2026RJ190002550196_01.pdf`. O pacote foi republicado antes do anúncio e
ainda não voltou a ser publicado.

O importador lê o PDF somente do pacote oficial e não monta URL individual de
arquivo. Por isso não há extração, resumo nem julgamento: a ingestão canônica
fica pendente até o pacote carregar o documento.

## Estado público

O registro passa de `sem_documento_oficial` para `documento_anunciado`, o mesmo
estado usado no anúncio de Ben Mendes em 04/09. A ficha deixa de afirmar que o
programa não foi entregue e informa que o TSE anunciou o documento e que o
resumo está pendente. O recibo de ausência de 30/08 continua íntegro como
evidência datada e deixa de ser vinculado ao estado público.

O monitor de programas registra a revisão do arquivo `190017144019` com
resultado `ausente_do_pacote`, medida no pacote acima. Um `idArquivo` diferente
volta a alertar.

## Retomada quando o pacote trouxer o PDF

A revisão do monitor não expira sozinha, porque o monitor não consulta o CDN.
Conferir o pacote do RJ a cada republicação. Quando ele trouxer
`RJ/2026RJ190002550196_01.pdf`, seguir o roteiro de
[ingestão](programas-governo-governadores-2026-ingestao.md): regerar o
inventário com o pacote novo, rodar a ingestão canônica com
`--ufs=RJ --sq-candidato=190002550196`, revisar e aprovar pelo decision file,
regerar o manifesto e retirar a revisão e a ficha do monitor.
