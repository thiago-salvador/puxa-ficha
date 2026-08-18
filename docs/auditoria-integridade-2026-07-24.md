# Auditoria de integridade dos dados de candidatos

**Data:** 24 de julho de 2026
**Escopo:** os 195 candidatos com `publicavel = true`, nas cinco dimensões pedidas: elenco correto, completude do que prometemos entregar, correção das notícias e informações, atualidade dos dados e validação cruzada contra fonte oficial.
**Método:** censo por SQL nas cinco dimensões, prova externa em amostra de 25 candidatos (5 por cargo, escolhidos pelo maior volume de notícias), e verificação adversarial de cada achado por céticos independentes que tentaram derrubá-lo reproduzindo a evidência do zero.
**Acesso ao banco:** somente leitura. Nenhuma correção foi aplicada.

## Resultado em uma linha

A plataforma acerta a engenharia e erra o conteúdo. O gate de publicação funciona, o CPF não vaza, a coorte reconcilia. O problema está em afirmações graves sobre pessoas reais publicadas com fonte que não existe, e em campos de identidade errados em fichas ao vivo.

## Semáforo por dimensão

| Dimensão | Status | Síntese |
|---|---|---|
| Notícias e informações corretas | **Vermelho** | 18 pontos de atenção publicados têm fonte única morta; 17 deles gerados por IA e marcados como verificados |
| Candidatos corretos (identidade) | **Vermelho** | 4 fichas ao vivo com nome civil ou dados de nascimento errados, confirmados contra fonte oficial |
| Completude | **Amarelo** | Nenhuma aba prometida está vazia por engano, mas idade não aparece em nenhuma ficha e o comparador só funciona para Presidente |
| Atualidade | **Amarelo** | A `/metodologia` anuncia cadência automática para 9 de 18 fontes sem automação rodando |
| Elenco (quem está no ar) | **Verde** | 248 linhas reconciliadas: 195 publicáveis, 53 bloqueadas com motivo, gate testado e funcionando |

---

## Vermelho

### V1. Afirmações graves sobre pessoas reais publicadas com fonte inexistente

Das 69 URLs de fonte com caminho que o site realmente publica, **18 retornam HTTP 404** (verificado por requisição direta em 24/07/2026). Elas não estão espalhadas: concentram-se inteiramente em citações de imprensa (g1, Folha, BBC, Intercept, ONU, gov.br), enquanto 48 das 69, quase todas oficiais (`stf.jus.br`, `tse.jus.br`, `mpf.mp.br`, TREs), respondem 200.

Cada uma dessas 18 URLs é a **única fonte** do ponto de atenção que ela sustenta. Ou seja, 18 afirmações publicadas ficam sem lastro nenhum. **17 das 18 têm `gerado_por = 'ia'` e `verificado = true`.**

Candidatos e afirmações atingidos:

| Candidato | Gravidade | Afirmação | Verificado |
|---|---|---|---|
| flavio-bolsonaro | crítica | "Compra de imóveis com depósitos em espécie" | true |
| lula | crítica | "Condenado na Lava Jato, preso 580 dias, anulado pelo STF" | true |
| lula | crítica | "Mensalão (2005): esquema de compra de votos no Congresso" | true |
| renan-santos | crítica | "Investigado por organização criminosa (STF, inq. 4923)" | **false** |
| flavio-bolsonaro | alta | "Mansão de R$ 6 milhões comprada durante mandato" | true |
| lula | alta | "Patrimônio cresceu 538% entre 2006 e 2018" | true |
| romeu-zema | alta | "Tragédia de Brumadinho: governo lento na cobrança da Vale" | true |
| ronaldo-caiado | média | "Grilagem de terras: fazenda Aliança contestada" | true |
| (mais 10 pontos de gravidade alta, média e baixa nos mesmos 5 candidatos) | | | |

O padrão das URLs indica citação fabricada, não link que expirou. Elas não seguem a convenção de nenhum dos veículos: `g1.globo.com/politica/mensalao/noticia/2012/12/stf-mensalao-condenacoes.ghtml` não tem o dia que o g1 sempre usa, e `www1.folha.uol.com.br/poder/caiado-udr-terra.shtml` não tem data alguma. Um link que morreu deixa rastro de redirecionamento; estes nunca existiram.

O agravante é o `verificado = true`. O campo que deveria ser a garantia editorial está afirmando que alguém conferiu uma fonte que não existe.

**Risco:** afirmação de crime, nomeada, publicada, sem fonte verificável. É exposição jurídica e reputacional direta, não dívida técnica.

### V2. Um ponto de atenção crítico escapa do gate por ser de curadoria

O ponto sobre `renan-santos` ("Investigado por organização criminosa") está publicado com `verificado = false`. O gate criado em `20260403234500_gate_unverified_ai_attention_points.sql` exige verificação apenas para conteúdo com `gerado_por = 'ia'`. Como este veio de `curadoria`, passou. O gate cobre a origem errada: o que deveria disparar a exigência é a gravidade da afirmação, não quem a escreveu.

### V3. Quatro fichas ao vivo com identidade errada

Confirmados contra fonte oficial, com o valor errado renderizando em produção:

| Candidato | Campo | No banco | Na fonte oficial |
|---|---|---|---|
| lucas-ribeiro (governador PB) | naturalidade, nascimento, nome, formação | MG, 1983-07-08, "Lucas Ribeiro", ensino médio | João Pessoa/PB, 1989-08-15, "Lucas Ribeiro Novais de Araújo", superior (TSE DivulgaCandContas 2022, registro 150001613756: `"nomeMunicipioNascimento":"JOÃO PESSOA","sgUfNascimento":"PB"`; valor conferido em 2026-07-25, corrigindo "Campina Grande PB" desta tabela) |
| eduardo-braga | nome_completo | contém "Granata" | nome não existe no Senado nem na Wikipédia |
| dr-fernando-maximo | nome_completo | "Fernando Máximo de Oliveira" | "Fernando Rodrigues Máximo" (Câmara, Wikidata e Wikipédia convergem) |
| daniel-vilela | nome_completo | "Daniel Goulart Vilela" | "DANIEL ELIAS CARVALHO VILELA" (Câmara, mesmo CPF) |

Três dos quatro são erro de curadoria manual, não colisão de homônimo: o `historico_politico` mostra que a entidade está certa, só o nome está errado. Quatro casos numa amostra de 25 sugere varredura da classe inteira, cruzando `nome_completo` contra o CPF na fonte oficial, em vez de correção caso a caso.

### V4. Histórico político inflado por bug determinístico

54 linhas de `historico_politico` em **35 candidatos publicados** têm período de mandato mais longo do que o real, incluindo um "Prefeito 2000-2020". A causa é [backfill-historico-periodo-fim.ts](../scripts/backfill-historico-periodo-fim.ts): o filtro por `tipo_evento = 'mandato'` esconde candidaturas intermediárias e a regra de proximidade passa na frente do teto de duração máxima. Correção única no script, não 54 correções manuais.

### V5. Patrimônio declarado com valor dobrado

Pelo menos 6 candidatos têm patrimônio da rota "Dados Abertos bem_candidato" exatamente **2,0000 vezes** o valor do DivulgaCandContas, com o valor inflado visível em produção. Fator exato em múltiplos registros aponta soma duplicada na ingestão, não erro de digitação.

### V6. Pré-candidatura publicada como fato estruturado

As 195 fichas emitem `cargo_disputado` e `situacao_candidatura` sem qualquer marcador de proveniência, inclusive no JSON-LD que os buscadores indexam (`jobTitle`) e no payload da API pública. O registro de candidaturas de 2026 só é protocolado até 15 de agosto (Lei 9.504/1997, art. 11, redação da Lei 13.165/2015), então nada disso é confirmável no TSE hoje. Um agregador que leia o JSON-LD vai publicar como fato o que é declaração editorial.

Some ainda em duas superfícies fora da ficha: `cargo_disputado` é interpolado cru, sem passar pelo formatador, no email de digest de alertas ([send-digest/route.ts:278](../src/app/api/alerts/send-digest/route.ts)) e na UI de gestão ([AlertsManageClient.tsx:310](../src/components/alerts/AlertsManageClient.tsx)). Quem tem `cargo_disputado = 'Nenhum'` recebe um email dizendo literalmente "Nenhum".

---

## Amarelo

| # | Achado | Números |
|---|---|---|
| A1 | Notícia associada por busca de nome, sem verificação depois do fetch | Taxa de erro de 85% a 100% em candidatos de nome curto ou comum; um deles mostra notícias de outra pessoa em 97,4% dos casos |
| A2 | 52 das 130 URLs de fonte publicadas apontam para a homepage nua do domínio, não para a matéria | 40% das fontes, atingindo 37 candidatos |
| A3 | 16 pontos de atenção críticos existem no banco sem fonte nenhuma | Hoje ocultos pelo gate, mas nada impede o insert |
| A4 | `/metodologia` anuncia atualização diária ou semanal para 9 de 18 fontes | Nenhuma automação verificável rodando; o rótulo honesto "sob demanda" já é usado nas outras 7 |
| A5 | Idade nunca aparece na ficha nem na API, mas aparece no comparador | 195 de 195 sem idade na ficha; `v_comparador` deriva com `COALESCE`, `candidatos_publico` não. 14 candidatos não veem idade em superfície nenhuma |
| A6 | Link direto de comparação ignora os slugs pedidos, exceto para Presidente | 182 de 195 nunca são comparáveis por link |
| A7 | QID cru do Wikidata em `profissao_declarada` | 46 de 195; não chega à tela, mas sai na API pública |
| A8 | `wikidata_id` apontando para homônimo | lucas-ribeiro (um cantor) e anderson-ferreira (um futebolista nascido em 1985, o político nasceu em 1972). Provável causa raiz do V3 |
| A9 | Corpo da ficha só renderiza depois do JS | Crawler sem JS vê apenas cabeçalho, foto e biografia |
| A10 | Fonte "Cadastro de Sanções (CGU)" anunciada em `/metodologia` | Zero linhas no banco, nenhuma superfície que a exiba |
| A11 | Selo de frescor prometido em "cada seção" | 3 das 7 abas não têm nenhum; 2 das 8 chaves nunca são renderizadas |
| A12 | Siglas partidárias fora do registro canônico | `PATRI` e `PATRIOTA` quebram a timeline do Cabo Daciolo; `MOBILIZA` precisa entrar como alias de `PMN`, nunca como partido separado |
| A13 | `cpf = '-4'` em guto-silva | Valor inválido; não vaza (o papel `anon` recebe permission denied), mas sugere varrer a integridade da coluna |

---

## Verde: o que foi testado e passou

- **Gate de publicação.** As 53 linhas não publicáveis estão bloqueadas. Slugs não publicáveis testados em produção retornam 404, não vazam por URL direta nem por `/api/candidato-slugs`.
- **Dado pessoal não vaza.** [api.ts:120](../src/lib/api.ts) exclui `cpf` e `wikidata_id` das colunas públicas, e o papel `anon` recebe `42501 permission denied` nessas colunas. Confirmado no payload real de produção.
- **Rota de preview protegida.** `/preview/candidato/[slug]` usa service role, mas o middleware exige token e falha fechado em produção.
- **Coorte consistente.** `validate:seed` passa com 239 candidatos; `check-ids-cohort` fecha 87 identificadores externos com zero divergência.
- **Fontes oficiais funcionam.** 48 das 69 URLs publicadas respondem 200, praticamente todas do Judiciário e do Executivo.

---

## O que os céticos derrubaram

Registrado porque um achado falso custa tanto quanto um achado perdido. De 60 achados brutos, **11 foram refutados** na reprodução independente:

- "Deputado Federal tem 0% de cobertura de votos": confundia cargo pretendido em 2026 com mandato exercido.
- "16 publicáveis com `situacao_candidatura` incerta": `incerto` é rótulo editorial honesto e nem chega a ser renderizado.
- "Card de patrimônio não rotula o ano": rotula, com "Declarado em 2012. Registro único disponível.", confirmado em render real.
- "CPF vaza": não vaza, e o próprio TSE publica CPF completo sem autenticação.
- "Comparador é um eixo morto": a home serve os 13 presidenciáveis com idade correta; o achado tinha o mecanismo invertido.
- "`fonte_dados` de renan-santos cita pessoa diferente": a explicação está escrita na própria biografia pública do candidato.
- "indicadores_estaduais parado há 115 dias": a fonte está rotulada "sob demanda", não há promessa quebrada.

Dois achados sobreviveram com o **mecanismo corrigido**, o que muda a correção: o histórico de Daniel Vilela (bug no script, não dado digitado) e o nome de dr-fernando-maximo (curadoria errada, não colisão de homônimo).

---

## Patch-list priorizado

| # | Ação | Esforço | Por quê agora |
|---|---|---|---|
| 1 | Despublicar os 18 pontos de atenção de fonte morta até revisão manual | Baixo | Afirmação de crime sem lastro sobre pessoa nomeada |
| 2 | Estender o gate para exigir fonte viva e `verificado = true` em gravidade crítica e alta, independente de `gerado_por` | Baixo | Fecha a porta pela qual o item 1 passou |
| 3 | Job periódico de link-check sobre `pontos_atencao.fontes`, ocultando a claim quando todas as fontes morrem | Médio | Impede a reincidência silenciosa |
| 4 | Validar formato de URL (caminho não vazio) antes de aceitar `verificado = true` | Baixo | Resolve os 52 casos de homepage nua |
| 5 | Corrigir os 4 nomes civis e a ficha de lucas-ribeiro, com varredura da classe por CPF | Médio | Dado errado sobre pessoa real, ao vivo |
| 6 | Corrigir o bug de `backfill-historico-periodo-fim.ts` e reprocessar as 54 linhas | Médio | Uma correção resolve 35 candidatos |
| 7 | Investigar o fator 2,0000 na ingestão de `bem_candidato` | Médio | Patrimônio inflado é dado sensível |
| 8 | Badge de "pré-candidatura declarada, não registrada no TSE" e trocar o `jobTitle` do JSON-LD por `cargo_atual` | Baixo | Impede que terceiros repliquem declaração como fato |
| 9 | Filtro pós-fetch que descarta notícia cujo título não menciona o candidato | Médio | Corrige o pior caso, de 97% de erro |
| 10 | Aplicar o `COALESCE` de idade em `candidatos_publico` | Baixo | Uma linha, alinha as duas views |
| 11 | Trocar os rótulos de cadência de 9 fontes para "sob demanda" ou implementar o schedule | Baixo | A copy afirma automação que não existe |
| 12 | Inferir o cargo pelos slugs no `/comparar` | Baixo | Devolve a comparação a 182 candidatos |

Itens 1 e 2 são de hoje. O resto entra em sprint normal.

---

## Limites desta auditoria

- **O elenco de 2026 não é verificável.** O registro de candidaturas só é protocolado até 15 de agosto, então `cargo_disputado` e `situacao_candidatura` foram tratados como declaração editorial, conforme premissa acordada antes da execução. Identidade e histórico foram validados contra TSE 2022, Câmara, Senado e Wikidata.
- **A prova externa cobriu 25 dos 195 publicáveis** (5 por cargo, os de maior volume de notícias). As quatro outras dimensões são censo completo. A taxa de erro de identidade encontrada na amostra, 4 em 25, não foi extrapolada para o universo porque a amostra é enviesada para os mais visíveis.
- **Notícias foram auditadas por regra determinística sobre as 17,5 mil linhas mais amostra manual**, não uma a uma.
- **`PF_CURATION_PHASE` em produção não foi verificado.** Nenhuma ferramenta desta sessão lê variável de ambiente da Vercel. Isso importa porque o valor padrão do código desliga a checagem de curadoria vencida.

## Como reproduzir

Queries versionadas em [scripts/audit/](../scripts/audit/): `elenco.sql`, `completude.sql`, `noticias.sql`, `frescor.sql` e `site.sql`. Cada arquivo é comentado, numerado e traz o resultado observado em 24/07/2026 junto de cada query, incluindo as ressalvas de onde a query em SQL é aproximação de uma regra implementada em TypeScript.

---

# Correções aplicadas em 2026-07-24

**Adendo, não reescrita.** Tudo acima é o laudo original e fica como está. Esta seção registra o que foi feito em resposta a ele.

Duas ressalvas de leitura, para ninguém entender errado:

- **"Aplicadas" quer dizer escritas no repositório, não no banco.** O banco de produção continuou somente leitura do começo ao fim. As 11 migrations abaixo são arquivos em `supabase/migrations/`, para revisão em PR e aplicação por um humano. Nenhum INSERT, UPDATE, DELETE, DDL ou `apply_migration` foi executado contra produção.
- **A execução aconteceu em 25/07/2026.** O trabalho partiu do laudo de 24/07 e por isso mantém a data dele no título, mas os arquivos, os testes de URL e as datas de acesso das fontes são de 25/07/2026. Os timestamps das migrations refletem isso.

Trabalho feito na branch `fix/integridade-fontes-2026-07`, sem commit, sem push e sem PR.

## Placar dos 12 itens do patch-list

**10 resolvidos, 2 parcialmente resolvidos, 0 não resolvidos.**

| # | Ação | Estado | Onde |
|---|---|---|---|
| 1 | Despublicar os 18 pontos de fonte morta | Resolvido | [20260725130000_fontes_mortas_substituidas_etapa1a.sql](../supabase/migrations/20260725130000_fontes_mortas_substituidas_etapa1a.sql) (12 ganham fonte viva) e [20260725133000_despublicacao_claims_sem_fonte_etapa1a.sql](../supabase/migrations/20260725133000_despublicacao_claims_sem_fonte_etapa1a.sql) (14 saem do ar). Cobertura 18 de 18 |
| 2 | Gate por gravidade, não por origem | Resolvido | [20260725160000_gate_gravidade_fonte_pontos_atencao.sql](../supabase/migrations/20260725160000_gate_gravidade_fonte_pontos_atencao.sql), espelho em [src/lib/public-attention-point.ts](../src/lib/public-attention-point.ts), 14 casos em [tests/supabase-attention-point-contract.test.ts](../tests/supabase-attention-point-contract.test.ts) |
| 3 | Job periódico de link-check | Resolvido | [scripts/link-check-pontos-atencao.ts](../scripts/link-check-pontos-atencao.ts), [.github/workflows/link-check-fontes.yml](../.github/workflows/link-check-fontes.yml), [tests/link-check-pontos-atencao.test.ts](../tests/link-check-pontos-atencao.test.ts) |
| 4 | Validar formato de URL antes de `verificado = true` | Resolvido | Funções e trigger na migration do item 2; os 52 casos de homepage nua em [20260725120000_fontes_dominio_nu_etapa1b.sql](../supabase/migrations/20260725120000_fontes_dominio_nu_etapa1b.sql) |
| 5 | Corrigir nomes civis e a ficha de lucas-ribeiro, varrendo a classe | Resolvido | [20260725123000_identidade_candidatos_fonte_oficial.sql](../supabase/migrations/20260725123000_identidade_candidatos_fonte_oficial.sql), 59 UPDATEs, inclui os `wikidata_id` de homônimo do achado A8 |
| 6 | Corrigir o bug de `backfill-historico-periodo-fim.ts` e reprocessar | **Parcial** | Dado corrigido em [20260725140000_historico_politico_periodo_fim_bug_v4.sql](../supabase/migrations/20260725140000_historico_politico_periodo_fim_bug_v4.sql) (28 linhas). Falta aplicar a correção ao script: [scripts/backfill-historico-periodo-fim.ts](../scripts/backfill-historico-periodo-fim.ts) não foi editado, o filtro `tipo_evento = 'mandato'` e a regra de proximidade contra `MAX_DURATION` seguem intactos, então rodá-lo de novo reintroduz o defeito |
| 7 | Investigar o fator 2,0000 em `bem_candidato` | Resolvido | Censo das 27 linhas contra CSV oficial do TSE: 15 dobradas, 11 corretas, 1 subcontada. Causa raiz não é código em execução, são literais escritos à mão em 13 migrations do commit `fbe7197`, somando arquivo UF e BRASIL sem deduplicar. Correção em [20260725143000_patrimonio_bem_candidato_duplicado.sql](../supabase/migrations/20260725143000_patrimonio_bem_candidato_duplicado.sql) |
| 8 | Badge de pré-candidatura e `jobTitle` do JSON-LD | Resolvido | [src/lib/candidatura-proveniencia.ts](../src/lib/candidatura-proveniencia.ts), [CandidatoFichaView.tsx](../src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx), [src/lib/public-profile-dto.ts](../src/lib/public-profile-dto.ts) |
| 9 | Filtro pós-fetch de notícia por menção ao candidato | Resolvido | [src/lib/news/name-match.ts](../src/lib/news/name-match.ts), consumido em [src/lib/news/refresh.ts](../src/lib/news/refresh.ts) |
| 10 | `COALESCE` de idade em `candidatos_publico` | Resolvido | [20260725170000_candidatos_publico_idade_derivada.sql](../supabase/migrations/20260725170000_candidatos_publico_idade_derivada.sql) |
| 11 | Rótulos de cadência honestos | Resolvido | [src/data/methodology-sources.ts](../src/data/methodology-sources.ts): as 9 fontes viram "sob demanda", com a regra escrita no topo do arquivo |
| 12 | Inferir o cargo pelos slugs no `/comparar` | Resolvido | [src/lib/comparador-cohort.ts](../src/lib/comparador-cohort.ts) e [comparar/page.tsx](../src/app/(site)/comparar/page.tsx) |

Além dos 12, entraram duas correções de dado que o laudo tinha listado no amarelo: o `cpf = '-4'` de guto-silva ([20260725150000](../supabase/migrations/20260725150000_cpf_invalido_guto_silva.sql), achado A13) e a coluna de motivo de despublicação mais o CHECK de formato de CPF ([20260725153000](../supabase/migrations/20260725153000_schema_motivo_despublicacao_e_cpf_formato.sql)).

## Re-auditoria de links: o número que importa

O laudo mediu 18 URLs mortas em 69 testadas. A re-auditoria mediu o estado **pós-aplicação simulado** das 11 migrations, ou seja, o que de fato continuaria publicado, e testou tudo de novo com `curl` e User-Agent de navegador em 25/07/2026.

| Momento | URLs publicadas | HTTP 200 | Morta (404 ou sem conexão) |
|---|---|---|---|
| Laudo, 24/07 | 69 | 48 | 18 (mais 1 x 403 e 2 sem conexão) |
| Simulação com as 10 primeiras migrations, 25/07 | 64 | 61 | 3 |
| Depois da migration 12, 25/07 | 62 | 61 | **0** |

As 3 que ainda falhavam viraram a migration [20260725180000_urls_mortas_residuais_reauditoria.sql](../supabase/migrations/20260725180000_urls_mortas_residuais_reauditoria.sql):

- **1 morta de verdade.** `cdn.tse.jus.br/.../consulta_cand_{ano}.zip`, com o placeholder `{ano}` nunca substituído, HTTP 404. Mesmo bug de ingestão que a etapa 1B já tinha pego em `eduardo-braide`, escapou porque a regra de lá era "domínio nu" e esta URL tem caminho. Atinge 2 claims (`enilton-rodrigues` e `orleans-brandao`), as duas de gravidade baixa. Não existe URL correta para colocar no lugar, porque o pacote do TSE é por ano e a claim agrega vários anos numa frase só. Veredito: sem fonte, as duas saem do ar com o motivo gravado.
- **2 sem conexão, que não são citação fabricada.** As duas URLs de `web.trf3.jus.br` no ponto de `aecio-neves` são reais: os buscadores devolvem exatamente elas com o título que está no banco. O domínio inteiro é que não responde, em `curl` (HTTP/2 e 1.1, IPv6 e IPv4) e em `urllib` do Python, nos dois dias, 24 e 25/07. Como a regra deste trabalho é que fonte publicada precisa responder 200 num teste real, elas foram trocadas por duas matérias do Consultor Jurídico verificadas em 25/07, com trecho literal citado na migration, e as URLs do TRF3 ficaram gravadas em `dados_relacionados` para restauração quando o domínio voltar.

Sobra 1 URL com HTTP 403, da UOL. Ela respondeu 200 na primeira passada e 403 nas seguintes: é bloqueio anti-robô depois da rajada, não página morta. O link-check do item 3 já classifica 401, 403, 429, 5xx e timeout como indeterminada, nunca como morta, então o guard-rail não despublica claim por isso. E a claim tem como fonte primária uma página do STF que responde 200.

## Gates e conferência

Os cinco gates do repositório foram rodados na árvore com todas as mudanças: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npx tsc --project tsconfig.scripts.json`. Os cinco passam com exit code 0. A suíte tem 1412 testes, 219 suítes, zero falha, contra a baseline de 1382 antes deste trabalho.

Cada um dos 143 `UPDATE` das 11 migrations foi transformado no `SELECT count(*)` equivalente, com o mesmo predicado, e rodado contra produção. Os 143 casam com exatamente as linhas que o comentário acima de cada um promete: 140 com uma linha cada, mais 19, 10 e 2 nas três instruções com lista `IN`. Zero divergência.

Uma divergência de número foi encontrada e explicada: o relatório da etapa 2B diz que o gate novo tira 6 pontos do ar, e a consulta refeita hoje dá 6 no banco inteiro mas 2 entre publicáveis, porque a consulta original não filtrava `candidatos.publicavel`. Os outros 4 são de candidatos já bloqueados. E dos 2 publicáveis, um (`flavio-bolsonaro`, rachadinhas) volta a passar porque a migration 120000 troca a home do g1 por uma fonte com caminho, e o outro (`renan-santos`) já é despublicado pela 133000. Depois da sequência completa, o gate novo não derruba nada de surpresa em ficha publicada.

## O que fica pendente

1. **Aplicar ao `scripts/backfill-historico-periodo-fim.ts` a correção já diagnosticada e simulada.** É a única pendência de código do patch-list. Enquanto não for feito, o item 6 volta na próxima execução do script.
2. **Nada foi aplicado no banco.** A ordem de aplicação importa: `20260725120000` antes de `20260725153000`, e `20260725130000` antes de `20260725133000`.
3. **Restaurar as duas URLs do TRF3** quando `web.trf3.jus.br` voltar a responder.
4. **`PF_CURATION_PHASE` em produção continua não verificado**, mesma limitação do laudo original.
5. **A divergência "54 linhas / 35 candidatos"** do achado V4 não foi reproduzida. O censo refeito dá 33 linhas em 22 candidatos, das quais 28 não curadas manualmente. Fica registrada como divergência aberta, não forçada para bater com o laudo.

---

# Fechamento: aplicado e verificado em produção (2026-07-25)

Esta seção substitui, por medição, o que as seções acima registravam como pendente.

## O que foi aplicado

As 21 migrations do PR [#14](https://github.com/thiago-salvador/puxa-ficha-oss/pull/14) foram aplicadas em produção via `supabase db push` em 25/07/2026, mais uma 22ª que restaura o arquivo da `20260713132135` (`norte_attention_points_approved`), que estava aplicada no banco sem estar versionada e travava o push. Optou-se por restaurar o arquivo a partir de `supabase_migrations.schema_migrations.statements` em vez de rodar `migration repair --status reverted`, que é o que a CLI sugere: a migration foi de fato aplicada, e marcá-la revertida deixaria o histórico mentindo e reaplicaria os inserts num banco novo.

O PR foi mergeado no `main` e o deploy de produção concluiu com sucesso.

## Efeito medido, antes e depois

| Métrica | Antes | Depois |
|---|---|---|
| Pontos de atenção visíveis em candidato publicável | 92 | 57 |
| Visíveis de gravidade crítica ou alta | 21 | 12 |
| Fontes apontando para domínio nu | 52 | **0** |
| URLs de fonte publicadas retornando 404 | 18 | **0 em 81 testadas** |
| Naturalidade de `lucas-ribeiro` | `MG` | `João Pessoa/PB` |
| `dr-fernando-maximo` | "Fernando Máximo de Oliveira" | "Fernando Rodrigues Máximo" |
| `daniel-vilela` | "Daniel Goulart Vilela" | "Daniel Elias Carvalho Vilela" |
| Idade na API pública | nula em 195 de 195 | derivada (`idade: 80` em `lula`) |

46 claims foram despublicadas com o motivo gravado em `dados_relacionados -> 'despublicacao_2026_07_25'`. Nenhuma linha foi deletada, então tudo é reversível e auditável.

As três imputações a pessoa errada estão fora do ar com veredito registrado: `renan-santos` e `ronaldo-caiado` como `sem-fonte`, `flavio-bolsonaro` como `precisa-reescrever`.

## Verificado no site em produção

- `/`, `/candidato/lula`, `/candidato/lucas-ribeiro`, `/comparar`, `/metodologia`, `/uf/ba` e `/rankings` respondem 200.
- Badge "Pré-candidatura declarada" renderizando na ficha.
- `jobTitle` do JSON-LD passou a usar o cargo atual ("Presidente da República"), fato verificável, em vez do cargo pretendido.
- Idade renderizando ("80 anos"), onde antes não aparecia em nenhuma ficha.
- `/comparar?c1=jeronimo&c2=acm-neto` mostra os dois candidatos pedidos, e não mais os 13 presidenciáveis.

## Pendências das seções anteriores que foram fechadas

- **Correção do `backfill-historico-periodo-fim.ts` na origem:** feita. O teto `MAX_DURATION` passa a vencer a regra de proximidade, o filtro deixa de esconder candidatura e linha com `tipo_evento` nulo, e candidatura só encerra mandato quando a renúncia é constitucionalmente obrigatória (art. 14, par. 6). Comparação do algoritmo antigo com o novo sobre 322 linhas reais: 20 propostas, 20 idênticas, zero regressão.
- **A divergência "54 linhas / 35 candidatos":** reproduzida. O critério do próprio script (`MAX_DURATION` por cargo, restrito a `publicavel = true`) devolve exatamente 54 linhas em 35 candidatos. Mas só 28 são o bug: as outras 26 são consolidações de mandatos consecutivos curadas à mão, e capá-las apagaria mandato real (`wellington-fagundes`, "Deputado Federal 1995-2015", tem observação "Sucessivos mandatos federais" e convive com as linhas granulares de 1998, 2002, 2006 e 2010). Ficam como pendência editorial, listadas no cabeçalho da migration.

## O que segue aberto

1. **CPF divergente de `jeronimo`.** Não é corrigível por `UPDATE` pontual, porque o CPF é chave de cruzamento da ingestão. Exige reancorar a ficha e reprocessar histórico, patrimônio e financiamento.
2. **Reescrita editorial das 10 claims** que saíram do ar como `precisa-reescrever`: têm fonte viva anexada, mas o texto publicado afirmava mais do que ela sustenta. Voltam quando o texto couber na fonte.
3. **4 linhas de histórico** com aparência de conflito entre ano de eleição e ano de posse, marcadas para decisão humana.
4. **26 linhas de consolidação de mandato** descritas acima.
5. **Duas URLs do TRF3** a restaurar quando `web.trf3.jus.br` voltar a responder.
6. **`PF_CURATION_PHASE` em produção** continua não verificado: nenhuma ferramenta desta sessão lê variável de ambiente da Vercel.
7. **Alerta Dependabot** de severidade média em `@hono/node-server`, escopo de desenvolvimento. Não entra no `npm audit` de produção, que fecha com zero vulnerabilidades.
