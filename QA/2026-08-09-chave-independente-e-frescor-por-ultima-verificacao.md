# QA: chave independente na etapa 2 e frescor pela última verificação

Data: 2026-08-09, noite. Pedido do dono: "Resolva os 12 e faça com que o copy se
refira à última data que qualquer dado do perfil foi verificado."

## Parte A: os 12 em revisão

### O que destravou

O registro da etapa 2 sempre previu o desbloqueio em
`contrato.criterio_identidade`: "não persistir até confirmação por data de
nascimento, SQ histórico ou CPF". Não havia implementação. Medido: **10 dos 12**
têm `data_nascimento` no banco idêntica ao `DT_NASCIMENTO` do snapshot TSE de
08/08.

| Slug | Data | SQ confirmado |
|---|---|---|
| `alysson-bezerra` | 1992-05-12 | 200002535255 |
| `clecio-luis` | 1972-04-08 | 30002536311 |
| `jeremias-cosmo` | 1980-03-27 | 170002541258 |
| `jeronimo` | 1965-04-03 | 50002536314 |
| `marcelo-maranata` | 1976-05-25 | 210002535802 |
| `maria-do-carmo` | 1959-11-26 | 40002541626 |
| `mateus-simoes` | 1981-03-09 | 130002541911 |
| `romeu-zema` | 1964-10-28 | 280002539826 |
| `samara-martins` | 1987-08-31 | 280002538811 |
| `tarcisio-gov-sp` | 1975-06-19 | 250002541303 |

`camila-falcao` e `witer-naves` seguem bloqueadas: sem data no cadastro, e o
backfill de CPF registrou decisão "nenhum" para as duas.

### Por que não é circular

A data do nosso lado tem proveniência **anterior ao pleito conferido**:
`consulta_cand` 2018/2020/2022/2024, DivulgaCandContas de ciclos passados ou
curadoria. Nenhuma cita 2026. Conferir o snapshot 2026 com dado extraído do
próprio snapshot 2026 não provaria identidade nenhuma, que é o defeito que
derrubou a rota 2 do backfill de CPF (precedente `jarbas-soares`). O gerador
reprova entrada sem `proveniencia`.

### Guardas contra promoção indevida

| Guarda | Prova |
|---|---|
| Hit **único** obrigatório | Fixture `5d`: dois hits com a MESMA data não promovem |
| Data ausente de qualquer lado | Fixture `5e`, os dois sentidos |
| Formato errado, calendário impossível, divergente | Fixture `5f`, 5 casos (`31/02`, ISO no lado TSE, `15/1/1980`, data diferente, vazia) |
| Cargo ou UF divergente | Fixture `5g`: continua `conflito_cargo_uf` |
| Coluna renomeada pelo TSE | Assert de densidade no gerador: `DT_NASCIMENTO` abaixo de 99% reprova |

### Registro v2

| Medida | v1 | v2 |
|---|---|---|
| `match_fresco` | 12 | **22** |
| `revisao_identidade` | 12 | **2** |
| `versao` | 1 | 2 |
| Hash de diagnóstico | `fc3e2235…3f8d1cf7` | `c08b3ef0…6fd282d5` |
| Hash de slugs | `c059935…22bcff9` | **inalterado** |

Diff conferido: **exatamente 10** entradas mudaram de classe, e todas as 10 têm
`registration`, `complement` e redes no snapshot.

## Parte B: o selo passou a dizer a verdade

### O defeito

`buildSectionFreshness` olhava só `verificacao_campos` e `ultima_atualizacao`.
As consultas de sanções (05/08) e a curadoria de processos (06/08) já estavam
carregadas na ficha e exibidas em outras seções, mas o bloco as ignorava: fichas
anunciavam junho tendo verificação de agosto na mesma página.

### A regra nova

Copy: `Dados do perfil verificados pela última vez em <data> (<fonte>).`
Vence a candidata **mais recente** entre frescor TSE completo, agregado curado,
sanções e processos, com a fonte nomeada.

**Consulta que falhou nunca vira selo.** Só `encontrado` e `vazio_confirmado`
disputam; `erro`, `indeterminado` e `nao_aplicavel` ficam fora, pelo mesmo
princípio de `ESTADOS_QUE_AVANCAM_FRESCOR`. Havia **30 fichas com `erro`** na
consulta de sanções de 05/08.

**Assimetria deliberada:** `resolverUltimaVerificacaoDoPerfil` escolhe a mais
recente (fontes independentes), `resolverFrescorTsePerfil` escolhe a mais antiga
(as três frentes TSE compõem um atributo só). Trocar uma pela outra inverteria o
significado do selo, e o comentário no código diz isso.

## Verificação de comportamento antes do merge

Servidor local (`npm run start` sobre o build novo) contra o Supabase de
produção, lendo `section_freshness.perfil_atual` pela mesma função que alimenta
a página:

| Slug | Antes | Depois |
|---|---|---|
| `romeu-zema` | `Perfil verificado em 09/06/2026 (Perfil factual curado)` | **`Dados do perfil verificados pela última vez em 09/08/2026 (TSE candidaturas 2026)`** |
| `tarcisio-gov-sp` | curado, 11/07 | **09/08/2026 (TSE candidaturas 2026)** |
| `mateus-simoes` | curado, 09/06 | **09/08/2026 (TSE candidaturas 2026)** |
| `eduardo-paes` | 08/08 (off-by-one) | **09/08/2026**, dia correto |
| `acm-neto` | curado, 09/06 | **05/08/2026 (Sanções: CEIS, CNEP e CEAF)** |
| `augusto-cury` | curado, 09/06 | **09/06/2026 (Perfil factual curado)**, inalterado e honesto |

`acm-neto` é a prova de que a semântica nova funciona sozinha: ele não é
`match_fresco` e mesmo assim ganhou data de agosto, porque a consulta de sanções
de 05/08 respondeu `vazio_confirmado`.

Primeira medição, antes do rebuild, ainda mostrava 08/08: era o `.next` do build
anterior ao rebase. Registrado porque é o tipo de coisa que faria alguém
concluir errado que a correção não pegou.

## Evidência

| Prova | Resultado |
|---|---|
| Suíte | **2482 pass, 0 fail** |
| Fixtures novas | 7 de identidade (`5b` a `5g`) + 8 de frescor |
| Cobertura que não existia | Nenhum teste cobria o copy do selo antes desta rodada |
| lint | 0 erros, 1 aviso preexistente em `.firecrawl/` |
| typecheck, `check:dead-code`, `settings:check`, `build` | verdes |
| `validate:seed` | 271, sem violação da etapa 2 |
| Materialização | 22 planejados, **12 pulados**, **10 escritos** |
| Reconciliação pós-escrita | 22 domínio, 22 trilha, 0 órfãs nos dois sentidos |

## A recoleta de sanções: autorizada, tentada, não feita, e por quê

| Achado | Medição |
|---|---|
| `ingest.yml` não recoleta sanções | A fonte que persiste é `sancoes`, **fora da allowlist** do workflow. A fonte `transparencia`, que está na allowlist, é **stub declarado** e não persiste |
| Run 31336467753 saiu `success` sem escrever nada | `coleta_log_ultima` idêntico antes e depois: 30 `erro`, topo 05/08 |
| Os 30 `erro` não são falha de API | `detalhe` idêntico nos 30: **"sem CPF: nenhum cadastro foi consultado"** |

Rodar de novo reescreveria os mesmos 30 erros: o Portal da Transparência exige
CPF, e essas fichas não têm. O que destravaria é backfill de CPF, que é trabalho
de identidade com risco próprio. Não foi feito aqui.

`augusto-cury` e mais 5 continuam com data de junho, e isso é o resultado
**correto**: ninguém verificou dado nenhum deles desde então.

## Readback final em produção (`0b08a3b`)

Merge por squash amarrado com `--match-head-commit`, autor preservado, zero
migrations tocadas. Cache revalidado (run 31341141915). **83 fichas lidas, 0
falhas, 83 com o copy novo.**

| Medida | Antes de hoje | Agora |
|---|---|---|
| Das 83 defasadas, com data de agosto | 0 | **72** |
| Fichas com data de agosto no total (194) | 111 | **183** |

Fontes que venceram o selo nas 83:

| Fonte | Fichas |
|---|---|
| Sanções: CEIS, CNEP e CEAF | 29 |
| TSE candidaturas 2026 | 22 |
| Curadoria de processos | 21 |
| Perfil factual curado | 11 |

Os **22 promovidos** exibem `09/08/2026 (TSE candidaturas 2026)`, com o dia
correto (sem o off-by-one). As **11 que não chegaram a agosto** são exatamente
as sem verificação recente de fonte nenhuma, incluindo `augusto-cury` (09/06),
`natasha-slhessarenko`, `ricardo-cappelli` e `lais-chaud`. Estão certas: o selo
está mostrando a lacuna em vez de escondê-la.

Evidência bruta: `output/pf-reverificacao-20260809/readback-final-20260809.json`.

## Pendências
- Recheque dos 43 `nao_localizado` em 16/08, após a janela do TSE fechar.
- `camila-falcao` e `witer-naves`: só destravam com data de nascimento de
  proveniência rastreável, ou outra chave independente (CPF, SQ histórico).
- Off-by-one de exibição de data pura: sessão paralela do dono.
