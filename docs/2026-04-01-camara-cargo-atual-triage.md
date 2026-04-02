# Camara `cargo_atual` Triage - 2026-04-01

## Objetivo

Classificar a coorte `camara_sem_cargo_atual` do [completude-report.json](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/scripts/completude-report.json) antes de abrir qualquer patch novo.

## Resultado

Os 20 casos auditados nao apontam bug imediato do hardening nem do resolvedor TSE. O padrao dominante e a API da Camara retornar situacoes nao ativas no `ultimoStatus.situacao`, entao o pipeline corretamente nao promove `cargo_atual` como mandato em exercicio.

Distribuicao da amostra auditada:

- `Vacancia`: 10
- `Fim de Mandato`: 8
- `Suplencia`: 1
- `Afastado`: 1

## Leitura pratica

- `Vacancia`, `Fim de Mandato` e `Suplencia` explicam `cargo_atual` vazio sem abrir regressao.
- `Afastado` apareceu uma vez (`marconi-perillo`) e merece decisao de produto separada: exibir cargo afastado ou manter vazio.
- `ciro-gomes-gov-ce` continua sendo duplicata de modelagem ja conhecida, nao caso novo de Camara.

## Amostra auditada

| slug | id.camara | situacao na API | classificacao |
| --- | ---: | --- | --- |
| washington-reis | 160620 | Vacância | sem mandato ativo |
| sergio-vidigal | 178874 | Vacância | sem mandato ativo |
| joao-roma | 204576 | Fim de Mandato | sem mandato ativo |
| jose-carlos-aleluia | 74553 | Fim de Mandato | sem mandato ativo |
| ciro-gomes-gov-ce | 141406 | Fim de Mandato | duplicata de modelagem + sem mandato ativo |
| capitao-wagner | 204487 | Fim de Mandato | sem mandato ativo |
| eduardo-braide | 204552 | Vacância | sem mandato ativo |
| anderson-ferreira | 160551 | Vacância | sem mandato ativo |
| pedro-cunha-lima | 178912 | Fim de Mandato | sem mandato ativo |
| margarete-coelho | 204430 | Suplência | sem mandato ativo |
| fabio-mitidieri | 178969 | Vacância | sem mandato ativo |
| jhc | 178842 | Vacância | sem mandato ativo |
| expedito-netto | 178953 | Fim de Mandato | sem mandato ativo |
| teresa-surita | 160608 | Vacância | sem mandato ativo |
| laurez-moreira | 141479 | Vacância | sem mandato ativo |
| celina-leao | 204380 | Vacância | sem mandato ativo |
| paula-belmonte | 204377 | Vacância | sem mandato ativo |
| daniel-vilela | 144523 | Fim de Mandato | sem mandato ativo |
| marconi-perillo | 73668 | Afastado | caso de regra de produto |
| fabio-trad | 160587 | Fim de Mandato | sem mandato ativo |

## Conclusao

Saida da Task 7:

- nao ha indicio de `ids.camara` errados nesta coorte
- o backlog principal e decisao semantica de produto para `Afastado`
- `cargo_atual` vazio aqui hoje representa, em quase todos os casos, ausencia de mandato ativo na API da Camara
