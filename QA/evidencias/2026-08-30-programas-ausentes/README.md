# Recibos de programas oficiais ausentes

O conjunto `receipt.json` registra a ausência de arquivo `codTipo 5` em cinco candidaturas a governador de 2026. Ele substitui a confirmação das 17:14 UTC por uma leitura mais recente, feita às 19:05 UTC no runner do data-freshness.

## Escopo

- Vera Lúcia, CE, SQ 60002553922.
- Ben Mendes, MG, SQ 130002544411.
- Eduardo Paes, RJ, SQ 190002543380.
- Garotinho, RJ, SQ 190002550196.
- Policial Edjane, SP, SQ 250002548080.

O endpoint oficial de cada candidatura retornou HTTP 200. Os payloads brutos estão em `raw/`, nomeados pelo próprio SHA-256. O recibo preserva URL, horário individual da chamada, hash, quantidade de arquivos e tipos observados.

Jorginho Mello, SC, SQ 240002537073, é o controle positivo do mesmo contrato: o payload contém um arquivo `codTipo 5`. Sem esse controle, o gerador recusa os recibos negativos.

## Resultado

As cinco respostas não contêm `codTipo 5`. Isso prova apenas a ausência de programa oficial no escopo e horário registrados. Não prova ausência universal e não muda nenhum dado público.

Fonte do transporte: workflow `33329832043`, executado no SHA `ee5158e253d9c90069cad2a9186ec12fd8acf38c`. O monitor TSE terminou `ok`; a falha geral do run veio do gate de freshness já existente para outra fonte.
