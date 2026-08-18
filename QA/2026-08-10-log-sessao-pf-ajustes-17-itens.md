# Log consolidado da sessão PF Ajustes, itens 1 a 17

Data: 2026-08-10 a 2026-08-11
Base imutável: `rc-lancamento` em `d17163f`
Branch de integração: `codex/pf-ajustes-integration-20260810`
Matriz canônica: `QA/2026-08-10-matriz-17-itens.md`

## Natureza deste registro

Este é o diário consolidado e auditável do trabalho feito nesta sessão. Ele registra decisões, medições, mudanças, falhas encontradas, correções, provas, commits, PRs e atos deliberadamente não executados. Não é uma transcrição byte a byte do terminal: saídas repetitivas foram resumidas e os artefatos reproduzíveis estão apontados no próprio repositório.

A matriz canônica continua sendo a fonte de estado dos 17 itens. Este arquivo é a fonte cronológica da execução que levou àquele estado.

## Escopo e restrições observadas

- O item 18, layout de email, permaneceu formalmente fora do escopo.
- O checkout principal e o branch `rc-lancamento` não foram alterados.
- Nenhuma migration foi aplicada em produção.
- Nenhuma coleta com escrita foi executada.
- Nenhum merge, deploy ou cron foi executado ou ativado.
- Todas as mudanças foram feitas em worktrees e branches isolados.
- Daciolo, Flávio Bolsonaro e Rui Costa foram tratados como regressões obrigatórias, não como limite do universo.
- Nenhuma falha de fonte, ausência de identidade ou busca não executada foi convertida em ausência confirmada.

## Estado de partida

- PR #156 aberta e limpa.
- `rc-lancamento` em `d17163f`.
- Onze itens já estavam prontos localmente: 1, 3, 5, 7, 8, 10, 11, 12, 13, 15 e 17.
- Seis itens permaneciam substantivamente abertos: 2, 4, 6, 9, 14 e 16.
- As contagens antigas de financiamento, 93 candidaturas históricas e 153 ausências em 80 fichas, foram tratadas como referências a revalidar, não como verdade atual.

## Isolamento e propriedade

| Frente | Worktree | Branch | Propriedade |
|---|---|---|---|
| Destaques | `/private/tmp/pf-ajustes-17.uQo9Kl/destaques` | `codex/pf-ajustes-destaques-20260810` | Itens 4 e 14 |
| Judicial | `/private/tmp/pf-ajustes-17.uQo9Kl/judicial` | `codex/pf-ajustes-judicial-20260810` | Item 2 |
| Financiamento | `/private/tmp/pf-ajustes-17.uQo9Kl/financiamento` | `codex/pf-ajustes-financiamento-20260810` | Itens 6, 9 e 16 |
| Patrimônio residual | `/private/tmp/pf-ajustes-17.uQo9Kl/patrimonio-delta` | `codex/pf-ajustes-patrimonio-delta-20260810` | Itens 1 e 17, delta oficial novo |
| Integração | `/private/tmp/pf-ajustes-17.uQo9Kl/integration` | `codex/pf-ajustes-integration-20260810` | Matriz, baselines globais e gates conjuntos |

Dependências locais ignoradas pelo Git foram ligadas aos worktrees para executar os gates sem alterar lockfile. O PostgreSQL local foi usado nos harnesses e encerrado ao final.

## Cronologia consolidada

### 1. Preflight e remedição

- `Settings/README.md` e a matriz canônica foram lidos antes das mudanças.
- O universo atual foi remensurado antes de reutilizar qualquer contagem.
- As três frentes foram separadas por propriedade para evitar edições sobrepostas.
- Foi criada uma integração serial sobre a mesma base `d17163f`.

### 2. Destaques, itens 4 e 14

Medição inicial:

- 194 fichas auditadas.
- 162 fichas com conteúdo publicável.
- 32 fichas sem cards.
- 0 vazios honestos persistidos.
- Trajetória: 88 estados silenciosos ou nunca verificados.
- Votações: 159 estados silenciosos ou nunca verificados.
- DOM: 194/194 fichas sem divergência.
- Mandatos: 423 cards, 0 sem proveniência.

Implementação:

- Foi criado o contrato de `vazio_confirmado` para banco, DTO, API e DOM.
- O vazio só pode ser promovido quando evidência externa prova que as fontes verificadas não entregam conteúdo publicável.
- Erro de fonte, identidade inconclusiva e fonte nunca verificada permanecem fail-closed.
- Banco, DTO, API e DOM foram cobertos no caminho compartilhado das 194 fichas.
- A proposta inicial de migration, rollback e harness foi preservada como experimento de QA, sem entrar no replay aplicável.

Falhas encontradas e corrigidas:

- A primeira versão da migration fixava o universo em 194 registros e falhava no replay histórico, cujo universo naquele ponto era 77.
- A migration passou a congelar o universo corrente dentro da própria transação, recusar universo vazio e validar cardinalidades simétricas no rollback.
- O review independente mostrou que, mesmo replay-safe, a proposta tratava autoauditoria do próprio dataset como proveniência suficiente. Isso não prova ausência externa.
- A migration e o rollback foram retirados de `supabase/migrations` e `supabase/rollback`, e a allowlist aplicável foi removida.

Resultado local:

- 162 fichas continuam com conteúdo.
- 32 fichas continuam vazias por falta de verificação.
- Zero fichas satisfazem o contrato completo de vazio honesto com evidência externa.
- Trajetória mantém 88 estados em `nunca_verificado`.
- Votações mantém 159 estados em `nunca_verificado`.
- A suíte focal passou e inclui um gate que recusa a presença da proposta no diretório aplicável.
- Harness PostgreSQL 17: 4 cenários e 16 asserts passaram.
- DOM: 194/194 fichas, 0 divergências.

Entrega:

- Contrato compartilhado de proveniência no código.
- Proposta de autoauditoria isolada em `QA/evidencias/2026-08-10-item4-14-destaques/proposta-autoauditoria/`.
- PR #157: https://github.com/thiago-salvador/puxa-ficha-oss/pull/157
- Head corretivo da frente: `0ccc43d0f3b6138880c02f2ff34ee2091f4fd2ed`.

### 3. Judicial, item 2

Medição inicial do universo de 194 fichas:

- 9 resultados positivos.
- 16 ausências confirmadas.
- 0 erros explícitos.
- 169 bloqueios editoriais.

Execução:

- As 28 fichas antes bloqueadas sem ocorrência nem URL foram efetivamente consultadas.
- As 28 terminaram com URL de busca e desfecho explícito.
- A execução percorreu 32.379 resultados da API e encontrou 1.388 ocorrências exatas.
- Nenhuma falha de rede foi convertida em ausência.
- As 28 continuaram como bloqueios editoriais reais, não como ausência judicial.
- O reconciliador passou a exigir desfecho em todas as 194 fichas.

Evidências curatoriais complementares:

- O pote de 05/08 contém 69 CNJs únicos em 21 fichas, 69 fontes e payload público completo.
- A curadoria de 10/08 contém 66 CNJs únicos em 25 fichas confirmadas e mais 7 fichas indeterminadas.
- Os conjuntos têm zero CNJs e zero fichas em comum. A união potencial contém 135 processos em 46 fichas.
- O artefato bruto de 10/08 continha CPFs. Foi versionado um manifesto sanitizado, sem esses dados pessoais, ligado ao SHA-256 do original.
- A identidade e as fontes oficiais do 66/25 foram provadas. Em rodada posterior,
  as 66 consultas também congelaram classe, tribunal, polo, órgão, tipo e data,
  sem inferir mérito, gravidade ou intervalo processual.
- Nenhum processo do pote 69/21 já estava persistido no readback anterior.
- Resultado simulado após a proposta: 30 positivas, 16 ausências confirmadas, 0 erros e 148 bloqueios editoriais.

Bloqueios preservados:

- O 69/21 e o 66/25 não são alternativas para uma mesma contagem. São curadorias independentes e adicionais.
- O gerador passou a exigir cardinalidades explícitas e recusa qualquer tentativa de assumir 66/25 ou 69/21 por padrão.
- O 69/21 foi aprovado editorialmente em 11/08/2026 como carga adicional.
- O 66/25 não pode virar migration até aprovação editorial nominal e independente.

Resultado local:

- 194/194 fichas com desfecho.
- 28/28 buscas executadas com URL.
- Testes focais provam cardinalidade, URLs oficiais, privacidade, disjunção e união dos dois manifestos.
- Typecheck, check de scripts, Settings e diff-check passaram na frente corretiva.
- Migration, rollback, readback, allowlist e manifesto 69/21 foram promovidos ao caminho aplicável, sem aplicação remota.
- O manifesto sanitizado 66/25 ficou em `QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/`.

Entrega:

- Head corretivo `428affb72cbf2088584744ce1477083ce83ca43c`.
- PR #158: https://github.com/thiago-salvador/puxa-ficha-oss/pull/158
- Nenhuma migration judicial foi aplicada em ambiente remoto.

### 4. Financiamento, itens 6, 9 e 16

Remedição global:

- 722 pleitos no universo auditado.
- 421 com dado financeiro positivo publicado.
- 8 com zero declarado.
- 57 fora da série oficial disponível.
- 1 pleito futuro.
- 235 ainda não coletados, distribuídos por 107 fichas.
- Desses 235, 121 eram históricos de 2002 a 2008, distribuídos por 67 fichas.

Lacunas por ano:

| Ano | Pleitos sem coleta antes |
|---|---:|
| 2002 | 32 |
| 2004 | 21 |
| 2006 | 38 |
| 2008 | 30 |
| 2010 | 15 |
| 2012 | 9 |
| 2014 | 14 |
| 2016 | 20 |
| 2018 | 12 |
| 2020 | 12 |
| 2022 | 27 |
| 2024 | 5 |

Implementação:

- O ingest foi estendido aos layouts oficiais anteriores a 2010.
- A identidade financeira passou a exigir `SQ_CANDIDATO + ano + UF` em todos os anos.
- Identidade sem UF ou sem correspondência comprovada termina em erro explícito, nunca em ausência.
- Foram separados os estados: publicado, zero declarado, ausência oficial confirmada, não coletado e erro.
- Cada ZIP passou a ser extraído em diretório isolado.
- Pacote parcial, ZIP vazio, CSV ausente, erro de parse, download incompleto e falha de escrita passaram a falhar explicitamente.
- Os erros do Supabase passaram a ser verificados em vez de ignorados.
- O estado persistido foi protegido por triggers simétricos e lock transacional contra conflito entre dado publicado e verificação.
- O rollback passou a reverter integralmente tabelas, views, colunas e constraints criadas.
- Foram removidos `BEGIN` e `COMMIT` internos das migrations para respeitar a transação do runner.
- O readback passou a consultar API e DTO públicos reais e a verificar o DOM visível, incluindo total, composição, alertas e doadores.
- O readback passou a comparar payload exato do universo, não apenas o rótulo do estado.
- As doze fontes oficiais e seus SHA-256 foram congelados em manifesto verificável.
- Os doze dry-runs de fonte foram versionados para reprodução em checkout limpo.

Falhas adversariais encontradas e corrigidas:

1. O readback engolia qualquer erro da view persistida e ainda podia sair com código 0.
2. Diretórios compartilhados entre ZIPs podiam transformar extração vazia em sucesso aparente.
3. Erros de parse só eram planejados em dry-run e não eram persistidos em execução real.
4. Erros de escrita no Supabase eram ignorados.
5. O rollback inicial deixava colunas e constraint da forward migration.
6. Wrappers transacionais internos podiam separar efeitos da migration e registro no ledger.
7. O readback inicial conferia estado, mas não identidade, valores, composição, fontes e doadores para todo o universo.
8. Anos a partir de 2010 ainda aceitavam fallback sem UF.
9. A regeneração do manifesto dependia de arquivos temporários não versionados.
10. O DOM era provado por JSON invisível, não pelos elementos visíveis do card.
11. Foi testada uma corrida real em duas conexões. Os dois interleavings terminaram com apenas um estado válido.

Resultado simulado dos 235 alvos:

- 141 publicados.
- 57 ausências oficiais confirmadas.
- 37 erros explícitos.
- 0 ainda não coletados.
- 0 novos zeros inferidos.
- Dos 37 erros, 19 vêm do layout oficial de receitas de 2004 sem `SQ_CANDIDATO` e 18 de identidade não comprovada.

Regressões obrigatórias:

- Daciolo 2006, SQ 12132, RJ: R$ 1.259,44.
- Daciolo 2008, SQ 14144, RJ: R$ 720,00.
- Flávio Bolsonaro 2002, SQ 851, RJ: R$ 5.988,00.
- Rui Costa 2006, SQ 27, BR: R$ 11.000,00.
- Casos adversariais fora dos exemplos foram incluídos nos testes de identidade, pacote parcial, corrida e mutação do readback.
- Os anos 2012 e 2014 foram validados contra pacotes finais, incluindo Vera Lúcia em 2012, R$ 40.245,20, e Patrus Ananias em 2012, R$ 17.408.279,15.

Prova e reprodutibilidade:

- Manifesto de 235 linhas com SHA-256 `a35b1820cb85eb1964d069ebb31ee53a9aa784f867a78180029850f9d3ec4c8f`.
- Manifesto das doze fontes em `QA/evidencias/2026-08-10-financiamento-universo/fontes/pacotes-oficiais.json`.
- Dry-runs de 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022 e 2024 versionados.
- Suíte da frente: 2.882/2.882 testes.
- Typecheck, check de scripts, lint focado, Settings, allowlist e manifesto passaram.
- Harness PostgreSQL passou, inclusive cenários de rollback, mutação adversarial e concorrência.
- Replay isolado: 293 aplicadas, 92 falhas históricas conhecidas, 0 falha nova.

Limitação local diagnosticada:

- O build Turbopack não aceita o symlink de dependências do worktree.
- O build Webpack compilou e parou depois em um export de rota preexistente, `createDeleteDataHandler`.
- A CI remota, com instalação limpa e ambiente normal, confirmou o build da PR.

Entrega:

- Migrations `20260810120000` e `20260810121000`, com rollbacks e readback pareados.
- Head corretivo `fd33f77bb6bb34d6a54db66ce9e3109c879abcb2`.
- PR #159: https://github.com/thiago-salvador/puxa-ficha-oss/pull/159

### 5. Integração conjunta

- As três frentes foram incorporadas serialmente sobre `d17163f`, sem conflito de propriedade.
- A matriz canônica dos 17 itens foi reescrita com causa, correção global, universo, prova local, ato externo, readback e estado por linha.
- Os baselines globais de migrations foram atualizados para o conjunto integrado.
- `recortes.json` e o contrato da view pública foram corrigidos para não tratar a autoauditoria de destaques como migration aplicável.
- O classificador estático e o manifesto de replay foram re-medidos após retirar essa proposta.
- A allowlist de destaques foi removida junto com o recorte aplicável.
- O hash do schema reproduzido foi atualizado após replay independente.

Falhas de integração encontradas e corrigidas:

- A primeira suíte conjunta falhou em três baselines globais: recortes, ordenação de migrations posteriores e cardinalidade do catálogo.
- O replay financeiro remoto inicialmente comparou o schema novo contra hash antigo.
- O review corretivo invalidou a migration de destaques por falta de evidência externa e a alegação de que o manifesto 66/25 não existia.
- Os baselines foram corrigidos novamente no branch de integração e re-medidos nos gates finais.

Prova conjunta antes da reauditoria posterior:

- 2.911/2.911 testes passaram com a origem pública canônica explicitada.
- A primeira execução herdou `NEXT_PUBLIC_SITE_URL=http://localhost:3000` do `.env.local` ligado ao checkout principal e falhou em quatro asserts de URLs. A reexecução com `https://puxaficha.com.br`, valor esperado pelos próprios testes, passou integralmente.
- Typecheck e check de scripts passaram.
- Lint passou com zero erro e um warning preexistente.
- Settings 7/7 passou.
- Gate de allowlists e manifesto financeiro passaram.
- Harness de destaques passou em 4 cenários e 16 asserts, contra a proposta isolada em QA.
- Harness financeiro passou, inclusive mutação adversarial, rollback de schema e fail-closed por drift.
- Replay linear integrado: 293 migrations aplicadas, 92 falhas históricas conhecidas, total classificado de 385 e zero falha nova.
- Schema gate: 69 migrations aplicadas, 316 puladas, zero falha e hash esperado confirmado.
- O build Turbopack local confirmou a limitação já diagnosticada: o symlink de `node_modules` aponta para fora da raiz do worktree.
- No commit corretivo `e54b68c`, verify, replay remoto, build de rotas, Vercel e CodeRabbit ficaram verdes, com zero check pendente ou falho.

Entrega:

- PR #160: https://github.com/thiago-salvador/puxa-ficha-oss/pull/160
- Head corretivo verificado remotamente antes deste fechamento documental: `e54b68c`.

### 6. Reauditoria nominal das 32 fichas sem destaques

- As cinco fontes foram reclassificadas ficha a ficha em artefato versionado.
- Sanções CGU: 7 vazios confirmados e 25 erros explícitos por falta de CPF.
- Judicial: 24 bloqueios editoriais e 8 fichas não reconsultadas nesta rodada,
  sem converter nenhuma em ausência.
- Trajetória: 8 buscas TSE concluídas como `sem_achado_no_escopo` e 24 estados
  `nao_coletado`. Entre os 24, 20 não têm identidade suficiente; os outros 4
  foram varridos de 2010 a 2026 sem linha exata, o que não prova carreira vazia.
- Votações: 32 `nao_coletado`; nenhuma ficha tem ID Câmara ou Senado versionado
  e aplicabilidade federal comprovada que autorize atribuição segura.
- Patrimônio: André Marinho, José Estevão e Samara Mineiro foram encontrados no
  pacote oficial corrente. A projeção após carga passa de 32 para 29 fichas sem
  card, mas zero ficha satisfaz ainda o vazio honesto completo nas cinco fontes.
- A proposta TSE-8 permaneceu fora de `supabase/migrations`, aguardando decisão
  editorial sobre persistir um resultado limitado ao recorte eleitoral.
- PR #157 atualizada para `0ccc43d0f3b6138880c02f2ff34ee2091f4fd2ed`, com CI verde.

### 7. Curadoria judicial 66/25 preparada sem inferência de mérito

- Foram executadas 66 consultas oficiais DJEN, todas sem erro HTTP.
- As 66 preservam identidade, CNJ, classe, tribunal, polo, órgão, tipo e data da
  comunicação. Zero foi autoaprovada editorialmente.
- O status técnico explícito é comunicação processual publicada com mérito não
  inferido. A UI fica neutra, sem gravidade fabricada, fora do contador criminal
  e sem intervalo ativo inventado na timeline.
- Fonte e URL oficiais agora atravessam banco, API, DTO e DOM.
- Migration proposta, allowlist, rollback, readback e manifesto do 66/25 ficaram
  fora do diretório aplicável e ainda exigem aprovação editorial nominal. O
  69/21 foi aprovado separadamente e promovido ao caminho aplicável.
- PR #158 atualizada para `428affb72cbf2088584744ce1477083ce83ca43c`.

### 8. Delta patrimonial oficial de 2026

- O universo foi remedido de 30 para 32 células, usando identidade por
  `SQ_CANDIDATO + ano + UF + nome exato + cargo` e hashes dos dois pacotes TSE.
- Resultado: 10 publicações, 1 retificação, 19 sem mudança e 2 ausências sem
  evidência corrigidas.
- José Estevão: 1 bem, R$ 600.000,00. Samara Mineiro: 2 bens, R$ 69.196,63.
- Dr. Luisinho e Preta Lu têm identidade exata e zero bens no pacote, mas
  `ST_DECLARAR_BENS` nulo. Ambos permanecem `nao_coletado`; zero linha não virou
  ausência oficial.
- A migration prepara 10 INSERTs, 1 UPDATE e 10 DELETEs, 21 escritas cobertas
  uma a uma pela allowlist.
- O readback residual prova as 13 fichas alteradas, com estado, valor,
  composição, fonte e SQ exatos. O readback global deixou de engolir erro da
  tabela de ausências.
- Harness Postgres 17: 9 ramos verdes, incluindo coorte parcial, SQ divergente,
  reaplicação, curadoria posterior, rollback e preservação dos dois estados
  `nao_coletado`.
- Suíte da frente: 2.866/2.866; focais: 28/28; replay da base da frente:
  292 aplicadas mais 91 falhas conhecidas igual a 383.
- Commit `2cdc0156ce364cfbcdfefb248872b5ae02e29c07`, PR #161, CI verde.

### 9. Promoção local do lote judicial aprovado 69/21

- A decisão editorial de 11/08/2026 aprovou o 69/21 como carga adicional e
  preservou o 66/25 como conjunto complementar sujeito a decisão própria.
- A migration `20260810122000_processos_curadoria_djen.sql`, a allowlist e o
  rollback foram promovidos ao caminho aplicável. Nenhum deles foi executado em
  ambiente remoto.
- O readback compara todas as 69 linhas por slug, CNJ, tipo, tribunal,
  descrição, status, fonte e URL. Links oficiais diretos de tribunais são
  aceitos quando coincidem exatamente com o manifesto aprovado.
- O harness Postgres 17 passou em cinco cenários: universo vazio, coorte parcial,
  aplicação exata, reaplicação e rollback com e sem URL cruzada por processo.
- A frente judicial fechou 2.894/2.894 testes, replay linear 292 + 92 = 384,
  schema gate 68 + 316 = 384, typecheck, check de scripts, Settings, allowlist,
  lint focado e build.
- Uma revisão externa alegou 16 URLs cruzadas. A remedição independente mediu
  55 URLs do Comunica PJe, com 45 corretas e 10 incompatibilidades determinísticas:
  Alexandre Kalil 7, Ataídes Oliveira 2 e Romeu Zema 1. As outras 14 fontes eram
  documentos diretos e foram preservadas; os seis casos adicionais alegados não
  foram alterados sem lista nominal e prova.
- O gerador passou a escolher a fonte nominal do processo e a validar também a
  URL individual existente na evidência DJEN. Migration e readback repetem a
  invariante `numeroProcesso = CNJ da linha` para URLs do Comunica PJe.
- As 10 URLs específicas foram reabertas somente para leitura: 10/10 HTTP 200 e
  10/10 com o CNJ esperado no payload. Depois da regeneração, o lote ficou em
  55/55 URLs do Comunica PJe corretas e zero cruzadas.
- Commit final da frente `102830309e2dd4eef7359c298103787240719f18`, enviado à PR #158.

### 10. Gate integrado posterior

- As correções de destaques, judicial e patrimônio foram incorporadas
  serialmente à integração.
- Suíte completa após o gate de URL judicial: 2.933/2.933.
- Typecheck, check de scripts, lint sem warning, spellcheck da UI, Settings 7/7,
  allowlists, manifesto financeiro e 12/12 fontes oficiais passaram.
- Harnesses PostgreSQL: destaques 4 cenários e 16 asserts; financiamento 235
  alvos com payload adversarial, rollback e drift; patrimônio 9 ramos;
  judicial 69/21 com 5 cenários fail-closed.
- Replay linear: 293 migrations aplicadas, 93 falhas históricas congeladas,
  conservação 386 e zero falha nova.
- Replay de schema: 69 aplicadas, 317 puladas, zero falha e hash
  `bcde0afe29b6619c7a7846f74fa075fc2bda7f9e6b6e9f11d1522d681c0b118e`.
- Build Turbopack passou depois de substituir, apenas no worktree isolado, o
  symlink ignorado de `node_modules` por uma cópia física da mesma instalação.
- Nenhum desses gates aplicou migration ou escreveu em produção.

### 11. Aprovações editoriais e workflow final

- O lote procedural 66/25 foi aprovado como carga adicional independente, sem
  autorização de aplicação, merge ou deploy. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Os oito resultados TSE limitados foram aprovados como
  `sem_achado_no_escopo`, sem declarar ausência de carreira. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Foi executado o workflow local dos itens 4, 7, 11 e 14 em três worktrees sem
  propriedade sobreposta, seguido de integração serial e eval independente.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### 12. Promoção local do 66/25 e TSE-8

- A migration `20260810123000`, rollback, readback, allowlist e recorte do
  66/25 entraram no diretório aplicável. O harness PG17 passou em cinco
  cenários: vazio, coorte parcial, aplicação de 66/25, reaplicação, URL cruzada
  e rollback com ledger. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A migration `20260810124000`, rollback, readback, allowlist e recorte do
  TSE-8 entraram no diretório aplicável. O harness passou em sete cenários e 17
  asserções, inclusive universo incompleto, verificação posterior e rollback
  anti-curadoria. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A auditoria 32x5 terminou com estado explícito para cada fonte: sanções 7
  ausências e 25 erros de identidade; judicial 24 bloqueios, 6 indeterminados e
  2 divergências; trajetória 8 resultados limitados e 24 bloqueios de
  identidade; patrimônio 3 positivos, 5 indeterminados e 24 bloqueios;
  votações 32 bloqueios por falta de ID legislativo. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### 13. Item 7, Senado, fechado globalmente

- O universo real foi remensurado em 13 linhas e 81 pares. Seis linhas
  ganharam evento oficial exato e totalizaram 75 pares; sete foram retiradas
  fail-closed por incoerência, duplicidade, segredo ou falta de evento nominal.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- O matcher por proposição foi removido. `Votou`, `AP` e `P-NRV` não viram
  polaridade ou ausência. Falha de rede, seleção, duplicidade ou upsert sobe
  como erro explícito. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- As migrations `20260811100000` e `20260811100100`, rollbacks, readback,
  allowlist, auditor oficial, gerador e harness PG17 foram integrados. O
  harness provou aplicação, rollback e estado adversarial sem mutação parcial.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### 14. Item 11, cards de dinheiro, fechado globalmente

- Playwright auditou 194 fichas em desktop e as mesmas 194 em mobile. Por
  viewport foram medidos 659 cards de patrimônio, 730 de financiamento, 65 de
  gastos e 311 resumos. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- DTO, DOM e ordem cronológica coincidiram em 194/194. Houve zero overflow,
  sobreposição e espaço anômalo. Hertz, Samara, Omar, Robério e Rui ficaram
  congelados em dez screenshots e dois readbacks JSON. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Gastos receberam ordenação anual descendente explícita. O teste visual foi
  tornado reprodutível, preservando o timestamp congelado dos recibos. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### 15. Gate integrado final local

- Suíte completa: 2.954/2.954. Typecheck, check de scripts, lint sem warnings,
  Settings 7/7 e build Turbopack passaram no mesmo worktree. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Cobertura de escrita: 23 recortes, 43 migrations anotadas, 21 allowlists,
  nenhuma escrita nova sem anotação e nenhuma violação. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Replay real: 293 migrations aplicadas e 97 falhas deliberadas, conservação
  exata de 390. Replay de schema: 70 aplicadas, 320 puladas, zero falha, hash
  `9ac9fdbdb4d29d52783ce53653048a5aa19df068233b32c7c97fd78c5641f121`.
  O diff de `pg_dump` terminou com três deltas canônicos, zero inesperado e
  zero faltante. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Nenhuma migration foi aplicada, nenhuma coleta com escrita foi executada e
  nenhum merge, deploy ou cron foi realizado. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Commits incorporados na integração

| Horário | Commit | Descrição |
|---|---|---|
| 18:57:04 | `dc53a7b` | Registrar execução residual da matriz PF Ajustes |
| 19:32:29 | `a67919e` | Fechar proveniência de vazios em destaques |
| 19:39:59 | `f06fe31` | Tornar auditoria de destaques replay-safe |
| 19:42:46 | `88e999b` | Registrar gates remotos de destaques |
| 19:44:22 | `efbe17c` | Reconciliar universo judicial e executar buscas pendentes |
| 21:36:07 | `f20f492` | Reconciliar financiamento por pleito |
| 21:48:23 | `5ce48d3` | Integrar matriz e gates dos 17 itens |
| 22:39:54 | `da1efbe` | Preservar manifestos judiciais complementares |
| 22:43:17 | `418a715` | Bloquear vazio sem evidência externa |
| 22:44:09 | `7385ea0` | Corrigir causas dos erros financeiros |
| 22:57:54 | `e54b68c` | Alinhar integração à revisão independente |
| 23:34:03 | `edc2524` | Reauditar fontes das fichas vazias |
| 23:38:05 | `9e51f30` | Preparar carga procedural judicial 66/25 |
| 23:42:47 | `4ac2cf8` | Adequar o contrato judicial ao spellcheck |
| 00:06:53 | `6bd5911` | Reconciliar delta patrimonial oficial de 2026 |
| 00:41:03 | `00b55e0` | Promover lote judicial aprovado 69/21 |
| 07:23:34 | `e096571` | Amarrar fonte judicial ao próprio processo |

Horários em `America/Sao_Paulo`.

## Artefatos principais

### Judicial

- `QA/evidencias/2026-08-10-item2-judicial/reconciliacao-universo.json`
- `QA/evidencias/2026-08-10-item2-judicial/retry-djen-28.json`
- `QA/evidencias/2026-08-10-item2-judicial/readback-producao-antes.json`
- `QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/`
- `QA/evidencias/2026-08-10-item2-judicial/proposta-69-21/auditoria-url-fonte-por-processo.json`
- `QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/`

### Destaques

- `QA/2026-08-10-itens-4-14-destaques.md`
- `QA/evidencias/2026-08-10-item4-14-destaques/`
- `QA/evidencias/2026-08-10-item4-14-destaques/proposta-autoauditoria/`

### Financiamento

- `QA/evidencias/2026-08-10-financiamento-universo/README.md`
- `QA/evidencias/2026-08-10-financiamento-universo/manifesto-235.json`
- `QA/evidencias/2026-08-10-financiamento-universo/fontes/`
- `supabase/migrations/20260810120000_financiamento_verificacoes_por_pleito.sql`
- `supabase/migrations/20260810121000_financiamento_reconciliado_universo.sql`
- Rollbacks e readback pareados em `supabase/rollback/` e `supabase/readback/`.

### Patrimônio residual

- `QA/2026-08-10-migration-patrimonio-rerun.md`
- `QA/evidencias/2026-08-10-migration-patrimonio-rerun/manifesto-delta-patrimonio-2026.json`
- `scripts/audit/readback-patrimonio-rerun.ts`
- `supabase/migrations/20260810093000_rerun_patrimonio_2026_tse_publicou.sql`
- Rollback e harness pareados.

## O que não foi executado

- Aplicação das migrations de financiamento.
- Promoção da proposta de autoauditoria de destaques para migration aplicável.
- Aplicação da migration judicial aprovada 69/21.
- Escrita de processos, financiamento, destaques ou logs de coleta em produção.
- Merge das PRs #156, #157, #158, #159, #160 ou #161.
- Deploy de qualquer SHA.
- Ativação de cron.
- Readback público pós-release, pois não houve release autorizado.
- Qualquer trabalho no item 18.

## Estado ao encerrar a execução segura

- Os 17 itens têm causa, correção global, universo, prova local, ato externo e readback esperado na matriz canônica.
- Os itens localmente prontos continuam marcados como `PRONTO LOCAL, NÃO VERDE`, porque não houve aplicação, merge, deploy nem readback público.
- O 69/21 e o 66/25 são manifestos judiciais adicionais e disjuntos. Ambos
  foram aprovados e promovidos ao caminho aplicável, sem aplicação remota.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- O 69/21 termina com 55/55 URLs do Comunica PJe amarradas ao próprio CNJ,
  zero URL cruzada e 14 documentos diretos preservados. Esse contrato é
  fail-closed no gerador, na migration, no readback e no harness adversarial.
- Os itens 4 e 14 continuam fail-closed: 32 fichas estão vazias hoje, 29 são a
  projeção após as cargas patrimoniais e zero satisfaz o contrato completo de
  vazio honesto nas cinco fontes. O TSE-8 aprovado registra somente o resultado
  limitado, e o resíduo restante está nomeado como identidade, fonte,
  indeterminado ou não aplicável. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Itens 7 e 11 foram reabertos e corrigidos globalmente: Senado fecha 13
  linhas/81 pares em 6 eventos/75 pares, e os cards de dinheiro passam em
  194 fichas por dois viewports. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Próximo ato externo recomendado: integrar o SHA final em `rc-lancamento`
  após CI remoto verde. Aplicação, merge em `main`, coleta, deploy, cron e
  readback exigem autorizações posteriores que nomeiem cada ato. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Workflow final dos itens 4, 7, 11 e 14, 11/08/2026

### Contador estruturado de ciclos

| Frente | Ciclo | Evidência nova que abriu o ciclo | Resultado | Estado |
|---|---:|---|---|---|
| Itens 4 e 14 | 1 | Auditoria 32x5 mostrou zero vazias honestas completas e estados silenciosos fora do recorte. | TSE-8 preparado sem inferir ausência; autoauditoria sem fonte externa permaneceu inaplicável. | concluído |
| Itens 4 e 14 | 2 | Eval independente encontrou 80 trajetórias, 29 patrimônios e 159 votações ainda `nunca_verificado`; recontagem achou mais três patrimônios fora das 32. | Matriz 194x5, 970 células; carga residual 80/32/159; zero `nunca_verificado`, zero `nao_coletado` e zero ausência fabricada projetados. | concluído |
| Itens 4 e 14 | 3 | A segunda rodada do eval terminou 7/11 e marcou C5 como `no`: havia células sem payload e três conteúdos sem endpoint externo; a projeção de votações também precisava incorporar as despublicações da Câmara e do Senado. | Matriz 194x5 regenerada com 970/970 payloads, zero conteúdo sem endpoint; carga residual corrigida para 80/32/180 e trajetórias/processos legados com fontes oficiais pareadas. | concluído localmente, aguardando eval 3 |
| Item 7 | 1 | Recontagem Senado encontrou 13 linhas, 81 pares e zero chave exata. | Seis eventos oficiais e 75 pares; sete linhas retiradas fail-closed. | concluído |
| Item 7 | 2 | Eval independente encontrou ausência do grader global e fallback moderno da Câmara ainda capaz de aceitar chave incompleta. | Grader Câmara mais Senado e ingest Câmara restrito a `fonte=camara` mais `votacao_id_api`, sem proposição. | concluído |
| Item 11 | 1 | Auditoria geométrica global encontrou a necessidade de padronização e ordem explícita de gastos. | Layout 194x2 sem overflow, sobreposição ou espaço anômalo. | concluído |
| Item 11 | 2 | Eval independente mostrou que texto não vazio não provava igualdade de conteúdo com o DTO. | Comparação integral de 28.837 tokens, 10.148 valores, 9.164 linhas, 126 fontes, 440 segmentos e 3.036 doadores por viewport; mutação Hertz rejeitada. | concluído |

Cada ciclo adicional nasceu de evidência nova e verificável. O terceiro ciclo
dos itens 4 e 14 foi aberto pelos quatro FAIL da rodada 2, não por repetição do
mesmo bloqueio. Nenhuma frente expandiu para o item 18. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### Medição global final local

- Destaques: 194 fichas, 970 células. A projeção após as dependências termina
  com 292 estados residuais, sendo 80 de trajetória, 32 de patrimônio e 180 de
  votações. São 241 estados `indeterminado`, 51
  `sem_achado_no_escopo`, zero `nunca_verificado`, zero `nao_coletado` e zero
  `vazio_confirmado` novo. As 970/970 células têm payload e nenhum conteúdo
  fica sem endpoint externo.
  Permanecem 29 fichas sem card por bloqueio factual explícito. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Votações: Câmara sem matcher por proposição; Senado 13 linhas/81 pares para
  seis eventos/75 pares, com sete retiradas nominais e 28/28 IDs auditados.
  A projeção nas 194 fichas termina em 14 com conteúdo, 28 com resultado
  limitado e 152 indeterminadas.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- UI financeira: 194 fichas em desktop e mobile, igualdade integral DTO/DOM,
  1.454 cards e 329 resumos por viewport, zero defeito geométrico. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Harnesses PostgreSQL 17 passaram para Lula, Câmara, Senado, patrimônio,
  Daciolo, financiamento, judicial 69/21, judicial 66/25, TSE-8 e estados
  residuais de destaques. O ciclo 3 acrescentou os harnesses das fontes oficiais
  de Cadu Xavier e Ricardo Cappelli, com 7 cenários e 17 asserções, e dos seis
  processos legados, com 7 cenários e 19 asserções. O harness de Lula passou a
  emular e provar o ledger do aplicador no rollback. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Replay linear final esperado no SHA limpo: 293 aplicadas e 100 falhas
  deliberadas, total 393. Replay de schema: 70 aplicadas e 323 puladas, zero
  falha, hash
  `9ac9fdbdb4d29d52783ce53653048a5aa19df068233b32c7c97fd78c5641f121`.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### Evidência nova do ciclo 3

- A rodada 2 do eval terminou 7/11, com FAIL nos critérios 1, 5, 8 e 11 e C5
  igual a `no`. O gate permaneceu fechado. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- `20260811101100_historico_fontes_oficiais_cadu_cappelli.sql` corrige a
  proveniência de cinco trajetórias e as datas da passagem de Ricardo Cappelli
  pela ABDI. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- `20260811101200_processos_legados_fontes_oficiais.sql` reaudita as seis linhas
  processuais publicadas sem número e URL: cinco recebem identificador e fonte
  oficial; uma alegação sobre Andorra é despublicada e deixa bloqueio editorial
  `indeterminado`, nunca ausência. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Os snapshots versionados em
  `QA/evidencias/2026-08-11-workflow-final/snapshots/` registram antes, depois e
  comparação das superfícies remotas somente leitura, incluindo refs, SHA
  público, respostas públicas e a evidência disponível de ledger. Nenhuma
  escrita de produção foi executada. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A suíte final esperada é 2.985/2.985. A rodada 3 independente precisa
  reproduzir o SHA final e devolver 11/11 PASS com C5 igual a `yes` antes de
  considerar o workflow encerrado. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### Ações externas preservadas

- Nenhuma migration foi aplicada, nenhuma coleta escreveu, nenhum merge ou
  deploy ocorreu e nenhum cron foi ativado. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- As autorizações operacionais separadas estão em
  `QA/2026-08-11-autorizacoes-release-pf-ajustes.md`. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### Eval independente final e ledger, 11/08/2026

- Rodada 3 no SHA `d2568bd854dd87047acd42e3b992a5fc9bc6d261`:
  10/11; critérios 1 a 7 e 9 a 11 PASS; critério 5 exatamente `yes`.
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- O único FAIL foi o critério processual 8: dois arquivos novos transitórios
  foram materializados por engano no checkout principal e removidos sem
  sobrescrever arquivo preexistente. O hash do status antes e depois do restauro
  é idêntico, mas o requisito literal de nunca tocar o checkout não foi cumprido.
  O incidente fica preservado, não reclassificado. [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- CI no mesmo SHA: verify, replay, rotas e preview verdes. Ledger-guard
  `31500076357`: 371 versões, topo `20260809060000`, 393 arquivos no repo e
  exatamente 17 migrations pendentes. A lista de autorização foi corrigida para
  começar por `20260809070000`. Nenhuma migration, coleta, merge, produção ou
  cron foi executado. [confidence: high, source: CI, ledger-guard e eval independente] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Integração do RC e endurecimento operacional, 11/08/2026

- A PR #160 foi mergeada em `rc-lancamento`; o remoto avançou de `d17163f`
  para `3f9fe89`, sem alterar o checkout principal nem a referência local de
  `rc-lancamento`. A PR #156 continua aberta contra `main`. [confidence: high, source: GitHub e refs Git locais] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- O backup agendado #31464234087 foi confirmado no SHA de produção `7e3e416`:
  PostgreSQL 17.10, `pg_restore --list` verde, artefato cifrado de 19.495.288
  bytes e digest
  `b55110642be19e93847da99f081a3aba33143a9f825181dbb97bd2686c3be18c`.
  Não houve download, decifragem nem restauração completa. [confidence: high, source: GitHub Actions backup-db e metadados do artefato] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A varredura pós-merge encontrou quatro rollbacks executáveis sem remoção do
  próprio ledger, o rollback `20260810090200` com uma chave retirada que a
  forward não insere e etapas sem readback fail-closed. A frente isolada
  preparou a correção global: 17 versões com readback canônico, ledger exato,
  payload por etapa e ordem reversa explícita dos rollbacks dependentes. Os
  wrappers judiciais apontam para o payload QA, sem duplicar as 69 e 66 linhas.
  Gates locais e PG17 ainda precisam confirmar o commit desta frente antes de
  integrá-la. [confidence: high, source: diff local e auditoria operacional] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A correção focal dos dois alertas CodeQL foi aberta na PR #163, commit
  `cfece8a`. Ela permanece separada deste endurecimento operacional. Nenhuma
  migration, coleta, merge em `main`, aplicação, deploy ou cron foi executado.
  [confidence: high, source: GitHub PR #163 e leitura de produção] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- O endurecimento operacional foi reproduzido localmente: 17/17 versões têm
  readback canônico e fail-closed; os cinco rollbacks auditados fecham o mesmo
  payload da forward e removem o ledger na transação externa; a ordem reversa
  Senado `111001` antes de `111000` está provada. Passaram 2.991/2.991 testes,
  typecheck, lint, Settings 7/7, allowlist, escrita auditada, `diff --check`,
  replay congelado 293 + 100 = 393 e schema gate 70 + 323 = 393 no hash
  `9ac9fdbdb4d29d52783ce53653048a5aa19df068233b32c7c97fd78c5641f121`.
  Os harnesses PG17 cobriram também URLs judiciais cruzadas, ledger ausente,
  ordem errada de rollback e drift de payload. Uma revisão posterior encontrou
  que o rollback `20260811100000` ainda apagaria curadoria do Senado adicionada
  depois da carga; a precondição passou a exigir as assinaturas exatas das seis
  linhas e 75 pares, e o PG17 prova que uma sétima linha posterior faz o
  rollback abortar preservando dados e ledger. A frente continua local até ser
  integrada ao RC; a implementação está na PR #164, commit `986c6b4`.
  [confidence: high, source: suíte local, gates, harnesses PostgreSQL 17 e GitHub PR #164] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A revisão adversarial seguinte encontrou falsos verdes de cardinalidade,
  payload e DDL nos contratos operacionais. A correção local agora compara os
  conjuntos completos de cada carga, inclusive campos com `NULL` explícito, e
  assina a estrutura criada por `20260810120000` sem congelar objetos legados ou
  a posição física das colunas. Ownership, RLS sem `FORCE`, opção
  `security_invoker`, funções, triggers, constraints, colunas, comentários,
  ACLs de tabela, view e coluna, índices, policies e ausência de objetos extras
  são fail-closed. O readback `093000` passou a provar o payload integral pela
  mesma conexão SQL, sem cruzar banco e API. [confidence: high, source: diff local e mutações PostgreSQL 17] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- Os cinco rollbacks auditados exigem ledger próprio antes de qualquer ação e
  recusam curadoria posterior ou estrutura divergente. Os cenários PG17 mutam
  título, detalhe, natureza, fonte, CNJ literal, linha financeira, voto
  posterior, owner, privilégio, policy, trigger, função, constraint e coluna;
  cada mutação aborta preservando dados e ledger. A implementação permanece
  sem aplicação remota. [confidence: high, source: harnesses PG17 locais] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- O patch final passou em 2.997/2.997 testes, typecheck, lint, Settings 7/7,
  allowlist, escrita auditada e `diff --check`. O agregador PostgreSQL 17
  executou 13 provas cobrindo as 17 versões, todas verdes; o revisor
  independente reproduziu 13/13, focal 30/30, `bash -n` e `actionlint`. O
  replay congelado fechou em 293 aplicadas + 100 falhas conhecidas = 393, e o
  schema gate em 70 + 323 = 393, hash
  `9ac9fdbdb4d29d52783ce53653048a5aa19df068233b32c7c97fd78c5641f121`.
  O workflow remoto agora observa readbacks, rollbacks, generators e harnesses
  e executa o mesmo agregador. O CI remoto do novo head ainda depende do push;
  nenhuma migration, coleta, aplicação, merge, deploy ou cron foi executado.
  [confidence: high, source: suíte local, replay, schema gate e revisão independente] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## RC final após autorizações de merge, 11/08/2026

- As PRs #163 e #164 foram mergeadas em `rc-lancamento`, com proteção pelos
  heads `cfece8a` e `dd25e71`. O RC remoto final avançou para `7bd30e3`.
  [confidence: high, source: GitHub PRs #163 e #164 + ref remota rc-lancamento] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- As PRs #157, #158, #159 e #161 foram fechadas como superadas, sem merge e
  sem remoção manual de branch. Seus deltas já estavam incorporados ou
  evoluídos pela PR #160.
  [confidence: high, source: estado das PRs no GitHub + comparação de patches e árvores] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- No SHA exato `7bd30e3`, a suíte local terminou em 2.997/2.997; typecheck,
  check de scripts e Settings 7/7 passaram. CI, replay com 13 provas PG17,
  CodeQL, rotas e Vercel ficaram verdes. `main`, produção, ledger, dados, coleta
  e cron não foram alterados.
  [confidence: high, source: runs GitHub Actions 31516439792, 31516439775 e 31516437020 + gates locais] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Execução de produção interrompida e remediação ACL, 11/08/2026

- A PR #165 foi mergeada em `rc-lancamento`, levando o RC a `1285366`. Dois
  backups frescos passaram: runs `31521051342` e `31521500098`, o segundo
  imediatamente antes da despublicação de votações. [confidence: high, source: GitHub Actions e refs remotas] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- As migrations autorizadas `20260809070000`, `10085000`, `10090000`,
  `10090100`, `10090200`, `10093000`, `10094000` e `10120000` foram aplicadas
  em transações individuais, com ledger e readback imediato. A última entrou no
  ledger, mas seu readback recusou `acl_invalidos=14`; a execução parou antes da
  `10121000`, como exigido. Produção ficou em 379 versões, topo `10120000`,
  tabela/view de verificações com zero linhas e financiamento com 651 linhas.
  [confidence: high, source: ledger, catálogo e readbacks diretos de produção] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- A causa é a concessão automática de privilégios pelo ambiente Supabase após
  `CREATE`: quatro extras na tabela, sete extras da service role na view, dois
  `SELECT` públicos e uma divergência de cardinalidade. A migration residual
  `20260810120500` normaliza 18 grants medidos para cinco grants exatos, sem
  reescrever a migration aplicada. O harness PG17 reproduz os 14 extras e
  recusa preestado, grant, linha, ledger, reaplicação e rollback fora de ordem.
  A integração local passou em 3.000/3.000 testes, 14/14 provas PG17, replay
  294 + 100 = 394 e schema 71 + 323 = 394, com hash canônico preservado.
  Nenhuma correção adicional foi escrita em produção. [confidence: high, source: ACL de produção, suíte, replay, schema e harnesses PostgreSQL 17] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Segunda interrupção fail-closed, ACL das funções, 11/08/2026

- 16:14 - A migration autorizada `20260810120500` foi aplicada em produção em
  uma transação com o ledger no mesmo commit. Seu readback canônico passou. O
  readback repetido da `20260810120000` abortou antes da `121000`: todos os
  invariantes estavam corretos, exceto a assinatura das duas trigger functions.
  O ledger ficou em 380 versões, topo `120500`; tabela e view permanecem vazias.
  [confidence: high, source: ledger e readbacks diretos de produção] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 16:14 - A leitura de `pg_proc.proacl` isolou seis grants `EXECUTE` explícitos
  e redundantes, três por função, para `anon`, `authenticated` e `service_role`.
  O grant default de `PUBLIC` já concedia o mesmo acesso, por isso a correção
  remove apenas as entradas diretas e não altera o comportamento dos triggers.
  [confidence: high, source: catálogo pg_proc/aclexplode de produção e reprodução PostgreSQL 17] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 16:14 - A migration local `20260810120600` exige ledger e ordem exatos,
  tabela vazia e o ACL automático completo; normaliza para `PUBLIC + owner` e
  tem rollback anti-curadoria. O readback `120000` passou a separar definição
  e ACL semântico, recusando grant posterior sem congelar a representação
  física `NULL` versus ACL default explícito. A ordem reversa
  `120600 -> 120500 -> 120000` foi provada integralmente. Gates: 3.003/3.003
  testes, 15/15 provas PG17, replay 295 + 100 = 395, schema 72 + 323 = 395 e
  hash canônico preservado. Nenhuma migration adicional foi aplicada.
  [confidence: high, source: suíte, harnesses PostgreSQL 17, replay e schema gate] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 16:14 - A implementação foi publicada na PR #167 contra `rc-lancamento`,
  commit `295f191`. A PR não foi mergeada e a migration `120600` não foi
  aplicada. [confidence: high, source: GitHub PR #167 e ledger de produção] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Merge da PR #167 e preparações paralelas, 11/08/2026

- 17:14 - A PR #167 foi mergeada em `rc-lancamento`; o RC ficou no merge
  `84b8a47c76d456d3cc5fb4cca71851c02ddfc59c`, com árvore idêntica ao head
  validado. CI, replay, CodeQL e Vercel passaram depois do merge. `main`, deploy
  e produção permaneceram no SHA anterior, sem migration, coleta ou cron novo.
  [confidence: high, source: refs e checks GitHub + deployment-info e ledger read-only] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 17:14 - O preflight isolado fechou as dez migrations pendentes com 15/15
  provas PostgreSQL 17, replay 295 + 100 = 395, schema 72 + 323 = 395 e 77/77
  testes focais. Produção continua com 380 versões, topo `20260810120500`; o
  próximo ato isolado é somente `20260810120600`, seguido dos readbacks
  `120600`, `120500` e `120000`.
  [confidence: high, source: preflight local e leitura direta do ledger] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 17:14 - O cron patrimonial de 16/08 foi preparado apenas em commit local,
  sem push ou ativação. O executor público da Fase 4 foi endurecido para ligar
  checkout, SHA, projeto, ledger completo, 21 readbacks, API e DOM das 194
  fichas em desktop e mobile. Dezessete testes executáveis e a suíte 3.024/3.024
  passaram; a PR residual ainda não havia sido aberta neste registro.
  [confidence: high, source: commits e gates locais isolados] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 18:27 - O executor público da Fase 4 foi endurecido contra falsos verdes de
  alvo, TLS, redirect, cache, checkout, branch protegida, cancelamento e corrida
  de SHA. A prova agora compara banco, API e DOM integral das 194 fichas nos
  dois viewports, incluindo os seis painéis navegáveis, a rota de timeline, os
  inventários completos e as seis subabas de legislação. O harness passou em
  17/17, a suíte em 3.024/3.024, e typecheck, check de scripts, lint, Settings e
  sintaxe passaram. A reconstrução sem cache revelou cinco timelines já
  degradadas; Orleans Brandão contém mistura de identidade e João Rodrigues e
  Renan Filho carregam linhas de homônimos de UF incompatível. Nada foi
  tolerado como `live`; uma frente isolada de identidade foi aberta antes do
  release.
  [confidence: high, source: runtime canônico 194, testes adversariais e revisão independente] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 18:58 - A reauditoria de identidade fechou 638/638 SQs pré-carregados no TSE
  e corrigiu globalmente as cinco timelines degradadas. Seis SQs sem identidade
  suficiente foram removidos, sete divergências ganharam UF histórica
  explícita e três âncoras de 2026 foram materializadas sem promover `#NULO` a
  candidatura confirmada. João Rodrigues e Renan Filho tiveram dados de
  homônimos enviados a quarentena reversível; Orleans Brandão foi separado do
  perfil composto. As migrations `20260811102000` e `20260811102100`, seus
  rollbacks e readbacks estão apenas preparados na PR #168, sem aplicação.
  [confidence: high, source: fontes TSE versionadas, harness PG17 e QA nominal da PR #168] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 20:56 - A revisão adversarial integrada fechou os falsos verdes residuais da
  correção de identidade. O universo canônico permanece em 194 fichas e
  639/639 SQs auditados. Orleans Brandão foi separado do governador homônimo
  com manifesto integral, declaração pública rastreável de pré-candidatura,
  `cargo_atual` nulo, fonte SEAM para o cargo exercido em 2025 e Diário Oficial
  para a exoneração em 2026; a URL institucional que hoje responde 404 foi
  removida e passou a ser recusada. O harness PostgreSQL 17 prova manifesto
  12/6/4/4, view pública 194 antes, depois e no rollback, recusa drifts para
  195, percorre 17 FKs, logs e FK futura, e compara schema e ledger. No SHA
  integrado, 3.026/3.026 testes, 23/23 focais, typecheck, scripts, lint,
  spellcheck, allowlist, replay 296 + 101 = 397 e schema 73 + 324 = 397 estão
  verdes. As PRs #168 e #169 seguem sem merge, e nenhuma migration, coleta,
  deploy ou cron foi executado.
  [confidence: high, source: SHA 45baf58, merge integrado 2968f46, fontes oficiais reabertas e revisões independentes] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 22:20 - O lote autorizado de onze migrations foi interrompido no primeiro
  readback divergente, depois de sete aplicações. As versões
  `20260810121000`, `122000`, `123000`, `124000`, `20260811100000`,
  `100100` e `101000` foram aplicadas na ordem; o ledger ficou em 388, topo
  `20260811101000`, e as quatro posteriores não foram aplicadas. A carga
  `101000` persistiu as 292 linhas exatas em 180 fichas, sem divergência em
  qualquer campo. O readback falhou porque seu hash dependia da collation do
  cluster: `en_US` produzia `4d9ea5…`, enquanto a ordem binária de produção
  produziu `456ba8…`. A correção local fixa `COLLATE "C"`, atualiza o
  gerador e prova o mesmo hash em dois clusters, preservando a recusa de payload
  adulterado. Não houve rollback, reaplicação, migration posterior, deploy,
  coleta ou cron.
  [confidence: high, source: ledger e payload de produção read-only + comparação nominal 292/292 + harness PG17 em duas collations] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Retomada e último bloqueio fail-closed, 12/08/2026

- 00:56 - Depois da integração da correção de collation, a retomada aplicou
  `20260811101100`, `20260811101200` e `20260811102000` com ledger e
  readbacks. Produção ficou em 391 versões, topo `20260811102000`; a
  `20260811102100` não foi aplicada porque o dry-run recusou cinco SHA do
  manifesto. Não houve escrita desta migration, rollback, deploy, coleta ou
  cron. [confidence: high, source: ledger e contagens read-only de produção]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 00:56 - A remedição integral mostrou 21/26 hashes idênticos e cinco
  divergências restritas a quatro linhas de financiamento e uma de patrimônio.
  Os cinco JSONB são semanticamente iguais ao manifesto: a diferença textual é
  exclusivamente a escala canônica dos tipos reais `numeric(15,2)`, com `0`
  serializado como `0.00` e `633192.4` como `633192.40`. O harness usava
  `numeric` sem escala, reproduzia o SHA incorreto e dava falso verde.
  [confidence: high, source: comparação PostgreSQL JSONB, information_schema e harness PG17]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 00:56 - O harness passou a replicar os tipos de produção; antes da correção
  ele falhou exatamente com cinco linhas adulteradas, e depois fechou todos os
  adversariais. O manifesto foi medido no estado pós-migrations predecessoras e
  a comparação read-only no banco atual passou 26/26, sem ampliar a allowlist
  12/6/4/4. [confidence: high, source: teste vermelho-verde, PG17 e leitura read-only de produção]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 07:45 - A PR #171 foi mergeada em `rc-lancamento` no commit
  `a86ebe749c1bf75b65a0141ee7f515ef8d54a29c`, com árvore idêntica ao head
  aprovado. O harness PostgreSQL 17 fresco passou, mas o dry-run remoto da
  `20260811102100` abortou antes de qualquer escrita: o cron das 08:00 UTC
  avançou somente `ultima_atualizacao` de João Rodrigues, e forward/readback
  congelavam esse timestamp como identidade. O ledger permaneceu em 391, topo
  `20260811102000`. [confidence: high, source: GitHub, harness e dry-run
  transacional remoto] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 07:45 - O gate foi corrigido globalmente para excluir apenas
  `ultima_atualizacao`, mantendo 13 campos estáveis, `created_at`, manifesto
  12/6/4/4, postimages e universo público 194 fail-closed. O teste
  vermelho-verde reproduziu o cron tanto antes do forward quanto depois dele.
  O harness completo voltou a passar e o dry-run remoto fechou ledger
  temporário, readback e fidelidade byte a byte, seguido de rollback. Nenhuma
  migration, coleta, alteração em `main`, deploy ou cron foi executada.
  [confidence: high, source: PG17 e dry-run read-only de produção]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 07:45 - A correção foi publicada na PR #172 contra `rc-lancamento`. A PR não
  autoriza nova aplicação; produção permanece no ledger 391 até merge e
  autorização nominal posteriores. [confidence: high, source: GitHub PR #172]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 08:10 - A PR #172 foi mergeada em `rc-lancamento` no commit `1f7a847`, com
  árvore idêntica ao head aprovado. O harness PostgreSQL 17 fresco passou. A
  primeira conexão para aplicar a `20260811102100` recebeu HTTP 502 antes de o
  SQL alcançar o banco; o ledger continuou em 391 e a migration ausente. A
  repetição do mesmo ato autorizado concluiu em transação única com ledger e
  readback. A leitura independente posterior confirmou 392 versões, topo
  `20260811102100`, MD5 `2decf80891fa9e4b38b2b327724811ac` idêntico ao arquivo,
  194 fichas públicas e readback `1|5|1|0|3|1`. `main` e produção pública
  continuam no SHA `7e3e416`; não houve deploy, coleta ou cron.
  [confidence: high, source: GitHub, harness fresco, ledger e readback de produção]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 09:32 - A PR #173 foi mergeada em `rc-lancamento` no commit
  `5e84b8975b47213d7d79597c7c03d228ce10b64e`. A PR #156 foi revalidada no
  mesmo head, mergeada em `main` no commit
  `c075780cb92681a1f8c4563e98dca875ede2587f` e publicada no mesmo SHA. O run
  `31593363805` revalidou as dez tags públicas com HTTP 200. Não houve coleta
  ou ativação de cron. [confidence: high, source: refs GitHub, CI, replay,
  deployment-info e workflow de cache] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 09:32 - A Fase 4 parou em `acm-neto`, sem falso verde. A API pública também
  degradou Cabo Daciolo e Orleans Brandão; o erro relacionado é SQLSTATE
  `42501`, `permission denied for table financiamento`. A causa global é a
  view `financiamento_publico` com `security_invoker`: a `20260811102000`
  passou a filtrar `despublicado_em`, mas os grants de coluna anteriores não
  incluíam essa coluna. Dados e ledger permanecem intactos em 392 versões,
  topo `20260811102100`. [confidence: high, source: API pública e diagnóstico
  read-only de ACL/PostgREST] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 09:32 - A correção `20260812123000` foi preparada sem escrita remota. Ela
  concede apenas as colunas exigidas pela view, preserva as colunas sensíveis e
  a ausência de `SELECT` na tabela bruta, e traz rollback/readback exatos.
  Suíte 3.029/3.029, PG17 focal e agregador 16/16, replay 297+101=398, schema
  74+324=398, typecheck, lint, Settings, allowlist e scripts passaram. O build
  Turbopack local ficou indisponível somente pelo symlink externo de
  `node_modules` do worktree e segue como gate obrigatório do CI da PR.
  [confidence: high, source: TDD e gates locais] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 10:14 - A PR #175 foi mergeada em `main` no commit
  `5a6179efca1cc837cb675514f86acb5e85251691`, com árvore idêntica ao head
  aprovado, e publicada no mesmo SHA. O harness PostgreSQL 17 fresco passou.
  A `20260812123000` foi aplicada em transação com ledger; produção ficou em
  393 versões e topo `20260812123000`. [confidence: high, source: GitHub,
  deployment-info, harness e ledger de produção] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 10:14 - O readback imediato abortou em `cpf_hash`, coluna inexistente no
  schema real de `financiamento`. O ato foi interrompido antes do cache e da
  Fase 4. A ACL aplicada está exata e a view é legível por `anon` e
  `authenticated`; o falso negativo nasceu porque o harness criava colunas
  sensíveis ausentes em produção. O teste vermelho reproduziu a falha com o
  catálogo real; o readback portátil e o harness corrigido passaram em PG17 e
  em leitura direta de produção. Não houve rollback, reaplicação, coleta ou
  cron. [confidence: high, source: erro remoto, catálogo/ACL read-only e TDD]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 11:00 - A PR #176 foi mergeada em `main` no commit
  `9c5ae50930c1260b5a1f9b144f63ebc913ec4907`, com árvore idêntica ao head
  aprovado, e publicada no mesmo SHA. O readback corrigido da
  `20260812123000` passou em produção. O run `31602792598` revalidou exatamente
  as dez tags públicas e recebeu HTTP 200. [confidence: high, source: GitHub,
  deployment-info, readback de produção e workflow de cache]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 11:00 - A Fase 4 não chegou ao ledger: o executor passava a URI em
  `PGDATABASE`, que o libpq trata como nome do banco, e tentou o socket local.
  Ao corrigir o transporte, a prova também mostrou que `verify-full` exige a
  CA oficial do Supabase, ausente no runner. Nenhuma divergência de dados foi
  observada e nenhuma escrita ocorreu. A correção decomõe a URI em variáveis
  libpq sem segredo no argv, fixa a CA oficial por fingerprint e oferece um
  workflow manual no SHA publicado usando o secret de banco já existente.
  [confidence: high, source: falhas locais reproduzidas, documentação oficial
  Supabase e TDD] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 11:30 - A PR #177 foi mergeada em `main` no SHA
  `f0f5b391dc42a37675179b344f6d7fbce59e5a31` e publicada no mesmo SHA. O único
  `UPDATE` autorizado corrigiu a linha `20260812123000` do ledger, de MD5 vazio
  `d41d8cd98f00b204e9800998ecf8427e` para o conteúdo exato de 7.237 bytes da
  migration, MD5 `ed32564d8f0398e3ba12c6da1fcc0819`; ledger 393, topo
  `20260812123000`. [confidence: high, source: GitHub, deployment-info,
  preimage, UPDATE com CAS e postimage byte a byte] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 11:30 - O workflow manual da Fase 4, run `31606691534`, parou no primeiro
  erro: o readback `20260810120000` exigia zero linhas na tabela de verificações
  mesmo depois de a `20260810121000` persistir corretamente 94, sendo 57
  ausências oficiais e 37 erros. TDD reproduziu exit 3; o contrato corrigido
  exige zero antes da carga e 94 depois. O harness PG17 completo e o readback
  read-only em produção passaram. A Fase 4 não foi reiniciada; não houve
  migration nova, coleta ou cron. [confidence: high, source: artifact do run,
  SQL versionado, harness PG17 e readback de produção] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 11:53 - A PR #178 foi mergeada em `main` no commit
  `eca104f4910a4a1398716ea10f4ac8d3e82d0e1c` e publicada no mesmo SHA. O
  workflow manual da Fase 4, run `31609453915`, executou nesse SHA e parou na
  primeira divergência, no readback `20260810121000`. [confidence: high,
  source: GitHub, deployment-info e artifact do workflow]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 12:22 - A divergência `3/3/3` foi reproduzida como vínculo temporal de
  identidade: o manifesto preserva três pleitos do governador arquivado sob o
  slug anterior `orleans-brandao`, enquanto a divisão `20260811102100`
  transferiu esse slug ao novo pré-candidato. Produção mantém os três registros
  no UUID correto; a leitura de serviço provou 2/2 identidades, 3/3 payloads e
  coortes 141/94/235. [confidence: high, source: manifesto versionado e leitura
  read-only de produção]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 12:22 - O gerador, o readback e o harness foram corrigidos para resolver por
  UUID, nome completo e nome de urna, permitindo o único fallback histórico
  somente quando a migration de divisão está no ledger. O teste vermelho
  reproduziu as três divergências; o PostgreSQL 17 passou o cenário temporal e
  recusou identidade adulterada. Nenhuma migration, coleta, correção de dados
  ou cron foi executado. [confidence: high, source: TDD, harness PG17 e testes
  focados]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 12:35 - Gates finais da correção: 20/20 focados, 3.032/3.032 na suíte
  integral, 16/16 provas PostgreSQL 17 do release, typecheck, check de scripts,
  lint, Settings, diff-check e build Turbopack em Node 24 verdes. [confidence:
  high, source: execução local no worktree isolado]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 13:17 - A varredura preventiva da Fase 4 confirmou mais dois readbacks
  temporalmente incompatíveis com a divisão de Orleans: `20260810122000`
  procurava dois CNJs do governador no slug transferido ao pré-candidato, e
  `20260811101000` ainda exigia a assinatura pré-split das 292 linhas. Ambos
  foram corrigidos no branch da PR #179 com identidade nominal, UUID, ledger e
  assinaturas condicionais. Os testes focais e o gate PostgreSQL 17 de 16/16
  provas passaram; nenhuma migration, merge, coleta, deploy ou cron ocorreu.
  [confidence: high, source: produção read-only, TDD e harnesses PG17]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 14:17 - A PR #179 foi mergeada em `main` e publicada no SHA
  `b96cec8b0c338c824fdab6f2351d8ef4e8f9def7`. O workflow manual Fase 4,
  run `31621678781`, executou no mesmo SHA e parou no primeiro desvio:
  `194/194` fichas, `970/970` células, cinco silenciosas, todas as fontes do
  novo perfil `orleans-brandao`. [confidence: high, source: GitHub Actions,
  deployment-info e artifact do workflow]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
- 14:40 - A causa foi fechada como lacuna de proveniência criada pela ordem
  temporal entre a carga residual e o split de identidade. A proposta
  `20260812124000` registra quatro estados `indeterminado` e uma trajetória
  `sem_achado_no_escopo`, exige identidade e ledger exatos e nunca copia dados
  do governador homônimo. Gates: 3.037/3.037 testes, build, 17 provas PG17,
  replay 297+102=399, schema 74+325=399, typecheck, lint, Settings e allowlist.
  Nenhuma migration foi aplicada e a Fase 4 não foi repetida. [confidence:
  high, source: TDD, harness PostgreSQL e gates locais]
  [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
