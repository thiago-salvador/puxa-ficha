# Proveniência de destaques-votações, 2026-08-30

## Escopo medido

- Banco consultado em modo read-only: projeto `wskpzsobvqwhnbsdsmok`.
- Universo: 23 registros em `votacoes_chave`, 154 pares distintos em
  `votos_candidato`, 30 candidatos.
- Dupla leitura aceita: `destaques-votacoes:20260830-run-c` em
  `2026-08-30T18:00:35.779Z` e `destaques-votacoes:20260830-run-d` em
  `2026-08-30T18:00:49.873Z`.
- Contrato: 93 fontes oficiais por execução, payload bruto gzipado, URL,
  timestamp real e SHA-256 por fonte, votação e par.
- Receipt da comparação: `57d945379a1d739be747edb87658060af5593d6895b74fa9af74f574d93913ed`.

Os payloads brutos ficam em `run-c/raw/` e `run-d/raw/`. Os manifests apontam
para cada artefato e permitem recalcular os hashes sem rede.

## Resultado dos 154 pares

- 151 confirmados pela fonte oficial.
- `jhc:2123843-93`: a Câmara devolve `Artigo 17`, enquanto produção ainda
  guarda `ausente`. A correção é predecessora e está isolada no PR draft 152.
- `joao-rodrigues:340812-195`: o deputado não aparece no payload nominal da
  votação. O par não é confirmado e deve sair da superfície com receipt.
- `flavio-bolsonaro:6756`: o endpoint nominal individual do Senado não traz o
  evento. O par `ausente` não é confirmado e deve sair da superfície com
  receipt.

Nenhum resultado usa `indeterminado`: cada par termina em `encontrado` ou
`sem_achado_no_escopo`.

## Cinco registros sem metadata oficial anterior

Três IDs foram recuperados de forma unívoca na fonte oficial:

- Privatização da Eletrobras: Câmara `2270789-73`, aprovação da Subemenda
  Substitutiva Global da MPV 1031/2021 em 19/05/2021.
- Arcabouço Fiscal: Câmara `2357053-47`, aprovação do substitutivo ao PLP
  93/2023 em 23/05/2023.
- Reforma Tributária: Câmara `2196833-326`, primeiro turno da PEC 45/2019 em
  06/07/2023.

Dois registros permanecem sem ID, por ausência verificável na superfície
oficial consultada:

- Impeachment de Dilma: o arquivo anual de 2016 não contém a votação final de
  17/04/2016 com ID nominal endereçável.
- Orçamento Secreto, Emendas de Relator: o arquivo anual de 2021 não contém
  votação nominal de 20/12/2021 ligada ao PLN 19/2021.

Esses dois vazios não foram preenchidos por título, memória ou aproximação.

## Falha fechada observada

Uma primeira dupla leitura foi descartada porque o endpoint do Senado para o
parlamentar 631 mudou entre as execuções: `Metadados.Versao` avançou de
`30/08/2026 14:41:23` para `30/08/2026 14:59:18` e o histórico foi reordenado.
O gate recusou os hashes divergentes. Os runs `c` e `d` só foram aceitos quando
fonte, votação e pares repetiram integralmente.

## Fontes oficiais

- Câmara, API e arquivos anuais: <https://dadosabertos.camara.leg.br/>
- Senado, votações por parlamentar: <https://legis.senado.leg.br/dadosabertos>
- Snapshot de produção: leitura SQL read-only via Supabase, sem escrita.

## Estado do gate estrito

A prova de proveniência e dupla leitura está verde. O gate de superfície segue
vermelho por mérito nos três pares acima. Ele só pode ficar verde depois da
correção predecessora de JHC e da migration draft que retira os dois pares não
confirmados e grava os receipts; nenhuma dessas escritas foi executada.

## Reconciliação proposta

A migration `20260830151500_destaques_freshness_reconciliation.sql` é uma proposta
separada e não foi aplicada. Ela exige como precondição o universo exato de 154 pares
e o voto de JHC já corrigido para `artigo_17`. No forward provado em PostgreSQL 17:

- 152 pares confirmados permanecem na superfície;
- os pares de Flávio Bolsonaro e João Rodrigues, não confirmados na fonte oficial,
  saem da superfície com receipt `sem_achado_no_escopo`;
- 155 receipts com proveniência são adicionados, um global e 154 por par;
- as 181 linhas sintéticas antigas permanecem intactas como histórico;
- três votações recebem `fonte=camara` e ID oficial;
- dois eventos históricos continuam sem fonte e ID, pois o arquivo oficial consultado
  não oferece um evento nominal endereçável.

Aplicação em produção depende de autorização nomeada do Thiago.
