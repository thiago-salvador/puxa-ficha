# Curadoria judicial complementar, 66 CNJs em 25 fichas

Este diretório versiona a curadoria nominal executada em 10/08/2026 sobre as 32
fichas prioritárias. Ela é complementar, e não substituta, ao lote 69/21 da
revisão editorial de 05/08.

## Resultado

- 32 fichas pesquisadas.
- 25 fichas com identidade confirmada.
- 66 números CNJ únicos nessas 25 fichas.
- 7 fichas indeterminadas depois de busca executada, sem conversão em ausência.
- 0 slugs e 0 CNJs em comum com o lote 69/21.
- União potencial: 135 CNJs em 46 fichas.

## Privacidade e proveniência

O artefato bruto de curadoria continha CPFs e detalhes pessoais usados apenas
para fechar identidade. Esses dados não podem entrar no repositório público.
`manifesto-identidade-judicial-66.json` é a projeção sanitizada: mantém slug,
CNJs, nível e tipo da evidência, tribunal, URLs oficiais, data e contagens, mas
omite CPF, texto livre do identificador, observações e dados pessoais
adjacentes. O SHA-256 do artefato bruto está preservado no campo `proveniencia`.

## Estado de publicação

`auditoria-payload-66.json` registra a reconsulta read-only dos 66 CNJs na API
oficial do DJEN em 10/08/2026. As 66 consultas terminaram sem erro. Em todos os
66 processos a resposta oficial sustenta identidade, classe, tribunal, polo do
candidato e data da comunicação.

Isso permite um payload procedural, mas não autoriza inferir mérito. A API
informa o estado e a data da **comunicação**, não o estado de mérito nem as
datas de início e decisão do processo. Promover `status: P`, `ativo` ou
`data_disponibilizacao` para esses campos seria semanticamente falso.

A descrição preparada usa somente CNJ, classes, tribunais, polos literais,
órgãos, tipos e intervalo das comunicações. O status público é
`comunicacao_processual_publicada_merito_nao_inferido`; `data_inicio`,
`data_decisao` e `gravidade` permanecem nulos. O frontend trata esse contrato
como comunicação neutra, fora do contador criminal e sem intervalo temporal
inventado, e expõe a URL oficial.

Medição fail-closed por processo:

- 66/66 com identidade observada na resposta oficial;
- 66/66 com classe, tribunal, polo e data de comunicação;
- 66/66 com órgão e descrição procedural determinística;
- 66/66 com payload técnico completo;
- 0/66 com mérito, data de início, data de decisão ou gravidade inferidos;
- 0/66 editorialmente aprovados nesta etapa.

O pacote completo está em `../proposta-66-25/`, ainda fora de
`supabase/migrations`: migration, allowlist, rollback, readback e manifesto de
66 linhas. O próximo ato é a aprovação editorial nominal desse contrato
procedural. Aplicação, merge, deploy e readback público continuam separados e
não foram autorizados.

O lote 69/21 permanece isolado em `../proposta-69-21/`, foi aprovado
editorialmente em 11/08/2026 como carga adicional independente e já tem
contrato aplicável local preparado. Essa decisão não se estende ao lote 66/25.
