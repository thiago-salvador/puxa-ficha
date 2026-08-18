# Fontes e dados

## Registro canônico

`src/data/methodology-sources.ts` é o catálogo público de fontes. Ele só deve
conter uma fonte quando o projeto já possui dado publicado e uma superfície que
o mostra. `docs/cobertura-de-dados.md` define a única régua de cobertura válida.

## Fontes em uso

| Grupo | Fontes | Uso principal | Cadência real em 06/08/2026 |
|---|---|---|---|
| Eleitoral | TSE e histórico eleitoral do TSE | Identidade, candidaturas, patrimônio, financiamento e trajetória | Sob demanda e por ciclo eleitoral |
| Legislativo | Câmara dos Deputados e Senado Federal | Votos, projetos, mandatos e gastos | Semanal |
| Transparência e controle | Portal da Transparência, Cadastros de Sanções da CGU, TCU e CEAPS | Gastos institucionais por órgão, incluindo totais mensais do CPGF, sanções, processos de controle e cota parlamentar | Sob demanda |
| Filiação | TSE: Filiação Partidária | Filiação e desfiliação | Sob demanda |
| Enriquecimento | Wikipedia e Wikidata | Bio, foto, redes e complemento de trajetória | Sob demanda e com curadoria |
| Notícias | Google News | Notícias recentes cujo título cita o candidato | Diária |
| Indicadores estaduais | IBGE/SIDRA, Ipeadata, Atlas da Violência, IDEB, CAPAG e Siconfi | Contexto econômico, social, fiscal, educacional e de segurança por UF | Sob demanda |

Descrição, URL, tipos de dado, natureza, cadência e curadoria de cada uma das 17
fontes ficam no registro canônico. Não copie detalhes divergentes para outros
arquivos.

## Hierarquia e prova

- Prefira base oficial para fatos eleitorais, patrimoniais, legislativos,
  judiciais e administrativos.
- Fonte pública complementar pode enriquecer bio, foto, redes e contexto, mas
  não derruba um dado oficial mais forte.
- Cada afirmação editorial precisa de fonte que sustente a frase e identidade
  suficiente para excluir homônimos.
- Links quebrados, páginas genéricas ou resultados de busca não são prova final.
- O CPF é chave de cruzamento exclusivamente no servidor e nunca dado de saída.

## Identidade

`SQ_CANDIDATO` confirmado é a chave eleitoral de persistência. Um nome igual ou
parecido nunca autoriza merge. Quando a fonte não oferece `SQ_CANDIDATO`, o
pipeline deve usar um gate documentado de identidade e mandar a dúvida para
quarentena ou revisão.

Filiação contínua também não pode ser fabricada. Se várias candidaturas oficiais
mostram o mesmo partido e não existe evento de desfiliação no acervo consultado,
o site pode apresentar os fatos conhecidos e a ausência de ruptura registrada,
mas deve distinguir isso de uma certidão completa de filiação entre as datas.

## Estados da coleta

O vocabulário operacional inclui `encontrado`, `vazio_confirmado`,
`sem_achado_no_escopo`, `indeterminado`, `erro` e `nao_aplicavel`. O relatório
de cobertura traduz esses resultados para estados de célula sem apagar a
procedência.

Regras:

- `vazio_confirmado` exige consulta aplicável concluída em todas as fontes
  obrigatórias da frente.
- `sem_achado_no_escopo` descreve curadoria limitada, não ausência absoluta.
- `indeterminado` e `erro` não fecham cobertura.
- Fonte não consultada continua pendente.
- `nao_aplicavel` exige uma regra comprovável, não conveniência de UI.

## Data de verificação por campo

Decisão de 09/08/2026. O contrato vive em código, em
[`src/lib/verificacao-campos.ts`](../src/lib/verificacao-campos.ts), e leitor e
escritor importam de lá. Ele governa a coluna `candidatos.verificacao_campos`,
que a ficha usa no bloco "Perfil atual".

**Só `publicado` e `vazio_confirmado` carimbam data.** `erro`, `indeterminado`,
`nao_coletado` e `nao_aplicavel` produzem **ausência da chave**, e a ausência é
o que preserva a data anterior. Não é estilo: o merge é
`COALESCE(verificacao_campos,'{}') || patch`, e em jsonb o `||` com null do lado
direito **sobrescreve**, então `{"social_networks": null}` apagaria uma data boa.
O tipo do patch proíbe null para que nenhum ramo consiga produzir isso.

**Exceção de shape para estado de aba, decisão de 15/08/2026.** As chaves
`votacoes_chave` e `historico_politico` não são datas de frescor do perfil.
Elas podem materializar um recibo que a própria aba lê, no formato
`{"estado":"nao_aplicavel|vazio_confirmado","motivo":"...","verificado_em":"YYYY-MM-DD"}`.
Votos aceita `nao_aplicavel`; Trajetória aceita `vazio_confirmado`. Esse objeto
não participa de `resolverFrescorTsePerfil` e só fecha a célula quando a aba o
exibe. Sem linha e sem recibo válido, o estado público continua pendente.

**Data no ledger não é confirmação de campo.** O ledger da execução B2 traz
`verified_at` nos 194 × 3 campos, inclusive nos 149 que nunca foram consultados
por falta de identidade segura, e 448 propostas combinam data com
`query_result: no_safe_match`. Quem traduz ledger em estado é a tabela abaixo,
nunca a presença de uma data.

**A tradução é por par `(campo, query_result)`**, não por `query_result` sozinho:
o mesmo resultado significa coisas diferentes conforme o campo. `no_safe_match`
aparece em `current_candidacy_status`, `profession`, `education` **e**
`biography`; `found` aparece em `news` e `current_office`. Par desconhecido faz o
pipeline falhar, em vez de virar `nao_coletado` por omissão. A tabela fechada
vive em
[`scripts/lib/verificacao-campos-ledger-b2.ts`](../scripts/lib/verificacao-campos-ledger-b2.ts).

**As chaves não têm relação 1:1 com os campos do ledger.**

| Chave de `verificacao_campos` | Campos do ledger que a sustentam | Pacote TSE |
|---|---|---|
| `candidate_registration` | `current_candidacy_status` | `consulta_cand_2026` |
| `candidate_complement` | **`profession` + `education`** | `consulta_cand_complementar_2026` |
| `social_networks` | `social_networks` | `rede_social_candidato_2026` |

Chave composta só resolve quando **todos** os constituintes resolvem; em
mistura, o estado que não avança domina, e a data escolhida é a mais antiga
entre eles. Uma data só cobre dois campos se os dois foram verificados.

Chave composta também exige **data válida em cada constituinte**: a data de
`profession` não pode afirmar cobertura de `education`. E a mais antiga é
escolhida por **instante**, nunca por ordem de string, porque `2026-08-06` e
`2026-08-06T03:42:25.708Z` são o mesmo dia com ordem alfabética invertida.

Data só é aceita em ISO estrito, e o calendário é conferido de verdade:
`new Date("2026-02-30")` devolve 02/03/2026 sem reclamar, e uma data que o
calendário não tem só vem de erro ou adulteração. Formato fora do ISO,
`2026-13-45` e `2026-02-30` são recusados, não convertidos.

**Com hora, o fuso é obrigatório** (`Z` ou offset explícito). Sem ele o mesmo
texto vira instantes diferentes conforme a máquina: medido,
`2026-08-06T23:30:00` dá `1786059000000` em UTC e `1786069800000` em
America/Sao_Paulo, três horas de diferença. Data pura (`YYYY-MM-DD`) é ancorada
em meia-noite UTC, que é explícito e estável.

A origem da data também é declarada por campo: as frentes TSE usam `source_date`,
que data a **fonte** (o snapshot oficial), e `news_query` usa `verified_at`, que
data a **consulta**. Uma preferência única erraria num dos dois lados.

**O agregado do perfil só avança com as três frentes TSE resolvidas**, e avança
pela data **mais antiga** entre elas. Verificação parcial não promove: cai para o
agregado curado. Um perfil composto de três campos está verificado apenas desde
o momento do seu componente mais velho; com o máximo, um recheque barato de um
campo lavaria o selo inteiro.

Estado medido em 09/08/2026, sobre as 194 fichas da fila B2: 43 com as três
frentes resolvidas, 149 sem nenhuma, e **2 casos** (`cleber-rabelo`,
`gilberto-vasconcelos`) cujo `social_networks` foi gravado como `null` embora o
ledger registre `no_row_for_safe_sq` com zero linhas, que é `vazio_confirmado` e
merece data. O gerador passou a emitir corretamente; o dado ainda não foi
corrigido, porque a migration que o carrega está retida.

## O que entra em `projetos_lei`, e como a ficha chama isso

Decisão de 08/08/2026, issue #138.

`GET /proposicoes?idDeputadoAutor=` na Câmara devolve **toda proposição
autoral**, não só projeto de lei. Entram requerimento (REQ), requerimento de
informação (RIC), indicação (INC) e emenda (EMC, EMP). A tabela se chama
`projetos_lei`, e a lista da ficha se chamava "Projetos de lei (N)", então o
acervo inteiro estava sendo anunciado como projeto de lei.

**O acervo persistido é a proposição autoral inteira.** Nada é descartado por
`siglaTipo` na ingestão. Duas razões:

- A curadoria nominal já vinha fazendo assim desde maio de 2026. Das 339 linhas
  do `eduardo-paes` na migration `20260507130000`, 93 são RIC, 81 são PL, 70 são
  EMC e 68 são REQ. Filtrar na ingestão criaria dois acervos incompatíveis, o
  curado com requerimento e o ingerido sem, no mesmo campo da mesma ficha.
- Descartar encolheria fichas publicadas, que é o oposto do que o
  [OBJECTIVE.md](OBJECTIVE.md) pede.

**O que muda é o rótulo, não o dado.** A classificação vive em
`src/lib/proposicao-natureza.ts`, aplicada na leitura:

| Natureza | Siglas | Como a ficha apresenta |
|---|---|---|
| `projeto_lei` | PL, PLP, PLC, PLS, PLN, PLV, PEC, PDL, PDC, PDS, PRC, PRS, MPV | Conta como projeto de lei |
| `outra_proposicao` | REQ, RIC, RCP, INC, EMC, EMP, EMD, ERD, SBT, PFC, SUG, MSC, e qualquer sigla desconhecida | Conta como outra proposição de autoria |

Sigla desconhecida cai em `outra_proposicao` de propósito: contar como projeto
de lei o que não se sabe o que é infla exatamente o número que a ficha promete.
Quando as duas naturezas convivem, a lista se chama "Proposições de autoria (N)"
e informa a composição logo abaixo.

### Cardinalidade declarada pela fonte

Nenhuma constante sabe quantas proposições um parlamentar assinou. O ingest lê o
total na própria Câmara com um request (`itens=1`, e o número da última página é
o total de itens) e grava esse número em `coleta_log`, na fonte
`camara-proposicoes`. Dele dependem duas decisões:

- o modo incremental só pula o candidato quando o banco alcança o declarado;
- `npm run audit:cobertura` só marca `ok` quando alcança. Abaixo disso é
  `partial` com o texto `truncado`, e sem número declarado a régua diz que não
  sabe, em vez de afirmar completude.

Antes disso, o ingest cortava em 100 (`slice(0, 100)`), o guard incremental lia
100 como "sincronizado" e a régua marcava `ok` para qualquer valor positivo. Os
três juntos mantinham 10 fichas publicáveis truncadas, entre elas dois
presidenciáveis, com o `efraim-filho` exibindo 100 de 2089.

## Cobertura versus completude

O índice atual mede 15 frentes visíveis e usa aplicabilidade. Campos de achado,
como processos ou sanções, ficam fora do índice porque ter um achado não torna a
ficha mais completa. O índice é diagnóstico, não permissão para abandonar
lacunas. Mesmo uma ficha com 100% pode exigir correção de procedência, qualidade
de foto, detalhes pessoais ou estado visual.

O comando canônico é:

```bash
npm run audit:cobertura
```

O snapshot lê produção em modo somente leitura. Relatórios avulsos, planilhas ou
contagens diretas da tabela `candidatos` não substituem essa régua.

## Regra de chegada ao frontend

Para cada frente, mantenha um mapa explícito:

```text
fonte -> coletor -> tabela/view -> DTO/API -> componente -> cache tag -> teste
```

Uma coluna criada sem DTO, um DTO sem componente ou uma persistência sem
revalidação são implementações incompletas. A tarefa continua aberta até o
readback da ficha pública.
