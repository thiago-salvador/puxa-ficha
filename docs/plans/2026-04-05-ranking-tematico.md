# Plano: Ranking Tematico

## Classificacao da mudanca

UI publica + data layer + SEO.

## Status da execucao

1. Fases 1 a 3 do MVP foram implementadas nesta branch.
2. Rotas publicas entregues: `/rankings`, `/rankings/[slug]`, `opengraph-image` do index e do detalhe.
3. Data layer entregue em `src/lib/api.ts` com `getRankingDataResource()`, fallback mock ajustado e mapeamento explicito do comparador para entradas de ranking.
4. Discovery e SEO entregues em `Navbar`, `Footer`, `sitemap`, metadata e JSON-LD das pages.
5. Validacoes concluidas neste ciclo: `npm run test` (`75/75`), `npm run check:scripts`, `npm run lint`, `npm run build`.
6. `npm run audit:release-verify` voltou a rodar localmente apos o script passar a carregar `.env.local`/`.env`.
7. O `release-verify` fechou com `276/280 OK`; as 4 falhas restantes ficaram fora do escopo de rankings (`dr-daniel` e `dr-fernando-maximo` em checks de partido na ficha/comparador).

## Contexto

O PuxaFicha precisa de portas de entrada organicas e conteudo compartilhavel. Rankings tematicos ("Quem mais gastou verba parlamentar", "Quem mais mudou de partido") podem gerar listas publicas rastreaveis, ordenadas por uma unica metrica estrutural do banco, sem transformar a pagina em juizo editorial de "melhor/pior".

Para manter a feature solida, o MVP precisa ser mais estreito do que a proposta inicial:

1. trabalhar so com metricas publicas de semantica simples
2. evitar score ponderado sobre campo editorial no MVP
3. tratar filtros por query string primeiro como UX, nao como nova superficie SEO indexavel
4. manter a implementacao dentro de `src/lib/api.ts`, sem acesso direto ao banco pelas pages
5. evitar migration nova no MVP, agregando no app sobre tabelas publicas ja expostas

## Escopo do MVP

Entrega desta rodada:

1. `/rankings` com cards de preview
2. `/rankings/[slug]` para rankings canonicos
3. OG image do index e dos rankings individuais
4. metadata, JSON-LD e sitemap das rotas canonicas
5. botoes de compartilhamento simples
6. filtro por `cargo` e `uf` via `searchParams`, somente como UX

Fora do MVP:

1. `processos-por-gravidade`
2. toggle asc/desc na tabela
3. short-link
4. view ou RPC dedicada no banco
5. texto secundario com timeline partidaria por linha

## Rankings iniciais e status

| slug | Metrica | Fonte principal | Estrategia | Status |
|------|---------|-----------------|------------|--------|
| `gastos-parlamentares` | Soma de `total_gasto` | `gastos_parlamentares` | agregacao no app | MVP |
| `mudancas-partido` | Contagem de trocas | `v_comparador.mudancas_partido` | reutilizar comparador | MVP |
| `patrimonio-declarado` | Ultimo `valor_total` | `v_comparador.patrimonio_declarado` | reutilizar comparador | MVP |
| `processos-por-gravidade` | Score ponderado | `processos.gravidade` | exige metodologia editorial explicita | adiado |

`processos-por-gravidade` sai do MVP porque hoje depende de peso sobre `gravidade`, campo curado editorialmente. Se voltar para a fila, precisa entrar com metodologia explicita e copy que nao venda a pagina como ordenacao neutra.

## Arquitetura

### Rotas

```
/rankings                            -- index com cards de preview
/rankings/[slug]                     -- ranking individual
/rankings/opengraph-image.tsx        -- OG image do index
/rankings/[slug]/opengraph-image.tsx -- OG image individual
```

Regras de rota:

1. `generateStaticParams()` retorna apenas os slugs canonicos do MVP
2. `dynamicParams = false` em `src/app/rankings/[slug]/page.tsx`
3. `slug` invalido retorna `notFound()`

### Filtros via `searchParams`

Parametros suportados:

- `?cargo=Presidente` - default
- `?cargo=Senador`
- `?cargo=Governador`
- `?cargo=Governador&uf=SP`

Regras:

1. `uf` so vale quando `cargo=Governador`
2. `cargo` fora do conjunto conhecido volta para `Presidente`
3. `uf` invalida e ignorada
4. combinacoes filtradas existem para navegacao e compartilhamento, mas nao entram no sitemap
5. pagina com query (`cargo` diferente do default ou `uf` presente) recebe `robots: { index: false, follow: true }`

### Config-driven: `src/data/ranking-definitions.ts`

Cada ranking continua sendo um objeto declarativo, mas o contrato precisa refletir o tipo real de fonte:

```typescript
type RankingMetricUnit = 'currency' | 'count'
type RankingQueryType = 'comparador-field' | 'aggregate-table'

interface RankingDefinition {
  slug: string
  title: string
  eyebrow: string
  description: string
  metricLabel: string
  metricUnit: RankingMetricUnit
  contextExplanation: string
  sortDirection: 'desc'
  queryType: RankingQueryType
  sourceField?: 'mudancas_partido' | 'patrimonio_declarado'
  tableName?: 'gastos_parlamentares'
  aggregateField?: 'total_gasto'
  supportsUf: boolean
}
```

Observacoes:

1. o MVP nao usa `secondaryText`
2. o MVP nao oferece `sortDirection: 'asc'`
3. adicionar ranking novo continua sendo: config + handler novo se surgir novo `queryType`

### Data layer: `src/lib/api.ts`

Nova funcao: `getRankingDataResource(slug, cargo?, estado?)`

```typescript
interface RankingEntry {
  candidato: Pick<CandidatoComparavel, 'id' | 'nome_urna' | 'slug' | 'partido_sigla' | 'cargo_disputado' | 'estado' | 'foto_url'>
  metricValue: number | null
}

interface RankingDataset {
  definition: RankingDefinition
  cargo: string
  estado?: string
  entries: RankingEntry[]
}
```

Estrategia por `queryType`:

- `comparador-field`
  - reutiliza `getCandidatosComparaveisResource(cargo, estado)`
  - mapeia explicitamente `definition.sourceField`
  - cobre `mudancas-partido` e `patrimonio-declarado`

- `aggregate-table`
  - carrega a base de candidatos com `getCandidatosResource(cargo, estado)`
  - consulta a tabela publica necessaria com `.in('candidato_id', ids)`
  - agrega no app por `candidato_id`
  - faz join com os metadados publicos do candidato
  - cobre `gastos-parlamentares`

Decisao do MVP:

1. nao criar migration nova nem view nova para rankings nesta rodada
2. nao usar SQL arbitrario no app
3. se a agregacao ficar cara ou complexa demais, abrir follow-up especifico para mover a metrica para view/RPC dedicada

Ordenacao canonica:

1. `metricValue` em ordem descrescente
2. `null` sempre no final
3. empate por `nome_urna`
4. a ordem exibida e a mesma usada em OG e JSON-LD

Cache:

1. seguir o padrao de `unstable_cache` ja usado no repo
2. chave estatica: `['ranking-data-resource']`
3. separacao por `slug`, `cargo` e `estado` entra pelos argumentos da funcao cacheada
4. `revalidate: APP_DATA_REVALIDATE_SECONDS`
5. tags estaticas no MVP; nada de tag dinamica por slug nesta primeira versao

Fallback e comportamento degradado:

1. agregar mocks a partir de `MOCK_GASTOS`, `MOCK_MUDANCAS` e `MOCK_PATRIMONIO`
2. corrigir o helper de mock para nao deixar `mudancas_partido: 0` por padrao quando `MOCK_MUDANCAS` existir
3. em development, falha da fonte principal pode cair para mock local com `sourceStatus: 'degraded'`
4. em producao, falha da metrica custom deve resultar em recurso degradado com mensagem clara e sem inventar score sintetico

### UI Components

| Componente | Tipo | Descricao |
|-----------|------|-----------|
| `src/components/RankingTable.tsx` | Server | tabela numerada no desktop e cards no mobile; sem toggle asc/desc no MVP |
| `src/components/RankingCard.tsx` | Server | card de preview para o index com top 3 canonico |
| `src/components/ShareButtons.tsx` | Client | Web Share API, X, WhatsApp e clipboard; sem short-link |

Reutiliza:

- `Footer`
- `SlashDivider`
- `DataSourceNotice`
- `JsonLd`
- `Navbar`

Detalhes de implementacao:

1. `RankingTable` deve expor atributos deterministas (`data-pf-ranking-row`, `data-pf-ranking-slug`, etc.) para facilitar smoke/release verify depois
2. estados vazios precisam de copy explicita quando nao houver candidatos para o filtro aplicado
3. o filtro pode ficar na propria page com `<form method="get">`, sem criar client component extra so para isso

### OG Images

Usar `buildEditorialOg()` existente em `src/lib/og.tsx`.

- Index
  - `eyebrow: "Rankings"`
  - `title: "Rankings tematicos"`
  - `subtitle: "Ordenacoes publicas por gastos, patrimonio e trajetoria partidaria."`

- Individual
  - `eyebrow: definition.eyebrow`
  - `title: definition.title`
  - `subtitle: "#1: {nome_urna} · {valor}"` quando houver lider
  - fallback generico quando a lista vier vazia

### SEO

1. `generateMetadata()` em cada page com `title`, `description`, `openGraph` e `twitter` via `buildTwitterMetadata()`
2. index usa JSON-LD `CollectionPage`
3. ranking individual usa JSON-LD `ItemList` com `ListItem.position` seguindo a ordem renderizada
4. sitemap inclui apenas `/rankings` e `/rankings/[slug]` canonicos, sem variantes filtradas
5. prioridade sugerida no sitemap:
   - `/rankings`: `0.7`
   - `/rankings/{slug}`: `0.65`

### Navbar

Adicionar `{ href: "/rankings", label: "Rankings" }` em `NAV_ITEMS` entre `Comparar` e `Quiz`.

## Arquivos

### Novos (10)
1. `src/lib/rankings.ts` - tipos e helpers puros de filtros, ordenacao, agregacao e formatacao
2. `src/data/ranking-definitions.ts` - definicoes dos rankings canonicos
3. `src/app/rankings/page.tsx` - pagina index
4. `src/app/rankings/[slug]/page.tsx` - pagina individual
5. `src/app/rankings/opengraph-image.tsx` - OG index
6. `src/app/rankings/[slug]/opengraph-image.tsx` - OG individual
7. `src/components/RankingTable.tsx` - lista/tabela responsiva
8. `src/components/RankingCard.tsx` - preview do index
9. `src/components/ShareButtons.tsx` - compartilhamento generico
10. `tests/rankings.test.ts` - TDD do nucleo e do contrato basico dos rankings

### Modificados na execucao (7)
1. `src/lib/api.ts` - `getRankingDataResource()` + agregadores + cache
2. `src/data/mock.ts` - helpers/uso de mocks para ranking
3. `src/app/sitemap.ts` - URLs canonicas de ranking
4. `src/components/Navbar.tsx` - item `Rankings`
5. `src/components/Footer.tsx` - link `Rankings` no rodape
6. `scripts/release-verify.ts` - smoke leve para `/rankings` e os tres slugs MVP
7. `src/components/quiz/QuizContainer.tsx` - correcao de tipagem do timeout para destravar `npm run build`

## Fases de implementacao

### Fase 1: Contratos e dados
1. Criar `ranking-definitions.ts` com 3 definicoes canonicas do MVP e registrar `processos-por-gravidade` como backlog adiado
2. Implementar `getRankingDataResource()` em `src/lib/api.ts`
3. Reutilizar `getCandidatosComparaveisResource()` para `mudancas-partido` e `patrimonio-declarado`
4. Implementar agregacao no app para `gastos-parlamentares` sobre `gastos_parlamentares`
5. Ajustar o fallback mock para usar `MOCK_MUDANCAS`, `MOCK_GASTOS` e `MOCK_PATRIMONIO`

### Fase 2: Paginas canonicas
6. Criar `RankingTable.tsx` sem toggle de sort
7. Criar `src/app/rankings/[slug]/page.tsx` com `generateStaticParams()`, `dynamicParams = false`, `notFound()`, `DataSourceNotice` e `ItemList`
8. Validar os slugs `gastos-parlamentares`, `mudancas-partido` e `patrimonio-declarado`
9. Garantir ordenacao deterministica identica entre UI, OG e JSON-LD

### Fase 3: Index, descoberta e compartilhamento
10. Criar `RankingCard.tsx`
11. Criar `src/app/rankings/page.tsx` com previews canonicos
12. Criar OG images do index e das paginas individuais
13. Criar `ShareButtons.tsx` e adicionar nas paginas de ranking
14. Atualizar sitemap e navbar
15. Se a rota entrar no menu publico nesta mesma branch, adicionar smoke leve em `scripts/release-verify.ts`

### Fase 4: Backlog explicito
16. Reavaliar `processos-por-gravidade` apenas com metodologia editorial escrita, copy especifica e decisao sobre mover a logica para view/RPC dedicada

### Fase 5: Verificacao
17. `npm run test`
18. `npm run check:scripts`
19. `npm run lint`
20. `npm run build`
21. Verificar `http://localhost:3000/rankings` e `http://localhost:3000/rankings/gastos-parlamentares`
22. Verificar que pagina filtrada (`?cargo=Governador&uf=SP`) fica `noindex`
23. Verificar OG images do index e de um slug individual
24. Verificar JSON-LD na ordem renderizada da tabela
25. Testar fallback mock sem `SUPABASE_URL`
26. Testar viewport mobile `375px` e desktop
27. Se o smoke de ranking tiver sido implementado na branch, rodar `npm run audit:release-verify`; se nao, registrar explicitamente o bloqueio antes de promover para producao

## Registro da implementacao executada

### Fase 1 executada: contratos e dados

1. Criado `src/lib/rankings.ts` com tipos e helpers puros para:
   - slugs canonicos
   - normalizacao de filtros (`cargo`, `uf`)
   - ordenacao canonica (`metricValue desc`, `null` no final, empate por `nome_urna`)
   - agregacao por candidato
   - formatacao de metrica para UI e OG
2. Criado `tests/rankings.test.ts` cobrindo:
   - slugs MVP
   - normalizacao de filtros
   - ordenacao deterministica
   - agregacao de linhas numericas
   - construcao de entradas a partir do comparador
   - formatacao de valores
3. Criado `src/data/ranking-definitions.ts` com `gastos-parlamentares`, `mudancas-partido` e `patrimonio-declarado`.
4. Integrado `getRankingDataResource()` em `src/lib/api.ts` com duas estrategias:
   - `comparador-field` para `mudancas-partido` e `patrimonio-declarado`
   - `aggregate-table` para `gastos-parlamentares`
5. Ajustado o fallback em `src/data/mock.ts` para preservar `mudancas_partido` e alimentar as agregacoes do MVP.
6. Substituido o cast fragil de `CandidatoComparavel` por mapeamento explicito para `RankingFieldCandidate`, reduzindo acoplamento com a forma da `v_comparador`.

### Fase 2 executada: paginas canonicas

1. Criada `src/components/RankingTable.tsx` com cards mobile, tabela desktop e atributos `data-pf-ranking-*` para smoke e auditoria.
2. Criada `src/app/rankings/[slug]/page.tsx` com:
   - `generateStaticParams()`
   - `dynamicParams = false`
   - `notFound()` para slug invalido
   - `DataSourceNotice`
   - JSON-LD `ItemList`
   - filtro por `<form method="get">`
3. Implementado `robots: { index: false, follow: true }` para combinacoes filtradas via query string.
4. Mantida a mesma ordenacao entre tabela renderizada, JSON-LD e OG usando o mesmo dataset ordenado.

### Fase 3 executada: index, descoberta e compartilhamento

1. Criados `RankingCard.tsx`, `ShareButtons.tsx`, `src/app/rankings/page.tsx` e as duas rotas de OG.
2. O compartilhamento simples ficou disponivel no indice `/rankings` e nas paginas `/rankings/[slug]`.
3. Atualizados `Navbar`, `Footer` e `sitemap` para incluir a superficie canonica de rankings.
4. Adicionado smoke leve em `scripts/release-verify.ts` para:
   - `/rankings`
   - `/rankings/gastos-parlamentares`
   - `/rankings/mudancas-partido`
   - `/rankings/patrimonio-declarado`

### Fase 4: backlog mantido explicito

1. `processos-por-gravidade` permaneceu fora do MVP.
2. Nao foi criado short-link.
3. Nao foi criada view ou RPC dedicada no banco.

### Fase 5 executada: validacao

1. `npm run test` - ok (`75/75`)
2. `npm run check:scripts` - ok
3. `npm run lint` - ok
4. `npm run build` - ok
5. `npm run audit:release-verify` - executado com app local em `http://localhost:3000`; resultado `276/280 OK`
6. As 4 falhas restantes do `release-verify` ficaram fora do escopo de rankings:
   - `dr-daniel: hero_party: PSB`
   - `dr-fernando-maximo: hero_party: UNIAO`
   - `dr-daniel: comparador_partido: PSB`
   - `dr-fernando-maximo: comparador_partido: UNIAO`

### Validacoes planejadas que ainda nao ficaram registradas neste ciclo

1. Abertura manual de `http://localhost:3000/rankings` e `http://localhost:3000/rankings/gastos-parlamentares` no browser com checklist documentado.
2. Verificacao manual do `noindex` em pagina filtrada (`?cargo=Governador&uf=SP`).
3. Verificacao manual das OG images do index e de um slug individual.
4. Teste manual do fallback mock sem `SUPABASE_URL` em execucao end-to-end.
5. Validacao manual de viewport mobile `375px` e desktop.

### Desvios e decisoes durante a execucao

1. O build falhou inicialmente em `src/components/quiz/QuizContainer.tsx` por tipagem de `setTimeout`; a correcao para `number | null` foi aplicada para fechar o gate de build sem alterar o comportamento do quiz.
2. O smoke de ranking foi ampliado de "um slug representativo" para os tres slugs MVP porque o custo de manutencao ficou baixo e a checagem ficou mais robusta.
3. O filtro de `uf` no form da page individual foi deixado submetivel no mesmo request em que o usuario muda `cargo`, evitando um UX quebrado em `Governador + UF`.
4. O `release-verify` passou a carregar `.env.local`/`.env`, alinhando o script aos demais utilitarios operacionais do repo e removendo um bloqueio artificial de ambiente local.

## Definicao de pronto da feature expandida

Para considerar rankings como feature expandida completa, nao basta o MVP estar verde. O fechamento final exige:

1. MVP atual preservado com testes, build, lint e `release-verify` sem regressao atribuida a rankings.
2. Ordenacao expandida (`desc`/`asc`) funcionando por query string, com UI clara, ordenacao deterministica e tratamento de canonical/noindex.
3. Cada linha do ranking com contexto secundario estrutural, sem texto solto inventado e sem depender de inferencia editorial opaca.
4. Compartilhamento curto de rankings (`short-link`) para detalhes e variantes filtradas.
5. Ranking `processos-por-gravidade` implementado apenas apos metodologia editorial escrita, criterios verificaveis e decisao explicita sobre custo de consulta.
6. Checklist manual registrado para browser, viewports, OG e variantes filtradas antes de chamar a feature de pronta para producao.

## Fora de escopo mesmo na versao expandida

1. Recomendacao automatica de voto.
2. Ranking editorial opaco sem metodologia publicada.
3. Exposicao de `pontos_atencao` gerados por IA como se fossem curadoria humana final.
4. Indexacao organica de variantes filtradas (`cargo`, `uf`, `ordem`) em vez da rota canonica.

## Roadmap da feature expandida

### Fase 6: ordenacao expandida (`desc` / `asc`)

#### Objetivo

Permitir leitura inversa do ranking sem quebrar a ordenacao canonica do produto nem abrir ruido SEO desnecessario.

#### Abordagem recomendada

1. Introduzir `ordem=desc|asc` via `searchParams` na page individual.
2. Manter `desc` como default e versao canonica.
3. Tratar `ordem=asc` como variante utilitaria de UX e compartilhamento, com `robots: { index: false, follow: true }`.
4. Reaproveitar o mesmo dataset base, mudando apenas o helper puro de ordenacao.

#### Mudancas tecnicas previstas

1. `src/lib/rankings.ts`
   - adicionar tipo de ordenacao (`RankingSortOrder`)
   - normalizar `ordem`
   - tornar o helper de sort parametrizavel
2. `src/app/rankings/[slug]/page.tsx`
   - ler `ordem` em `searchParams`
   - ajustar metadata/canonical/robots
   - renderizar controle de ordenacao no bloco de filtro
3. `src/components/RankingTable.tsx`
   - manter atributos deterministas e ordem refletida na UI
4. `tests/rankings.test.ts`
   - cobrir sort ascendente e normalizacao de `ordem`

#### Criterios de aceite

1. `desc` continua identico ao MVP atual.
2. `asc` inverte a ordenacao mantendo `null` no final e empate por `nome_urna`.
3. URL com `ordem=asc` nao entra no sitemap e recebe `noindex`.
4. A tabela, o JSON-LD e o titulo de compartilhamento refletem a mesma ordem exibida.

### Fase 7: contexto secundario por linha

#### Objetivo

Dar mais contexto factual para cada linha sem transformar o ranking em resumo editorial opaco.

#### Abordagem recomendada

1. Estender `RankingEntry` com um campo opcional e estruturado de contexto secundario.
2. Calcular esse contexto no data layer, nunca no componente.
3. Priorizar campos estruturais por ranking:
   - `gastos-parlamentares`: categoria de gasto mais relevante ou ano mais recente com gasto
   - `mudancas-partido`: resumo de trajetoria partidaria baseado em mudancas registradas
   - `patrimonio-declarado`: ano da declaracao patrimonial usada no ranking

#### Dependencias

1. Revisar custo de agregacao de `gastos_parlamentares` e `mudancas_partido`.
2. Garantir fallback claro quando o contexto secundario nao existir.

#### Criterios de aceite

1. Cada ranking mostra contexto secundario apenas quando houver dado estrutural verificavel.
2. O layout continua legivel em mobile e desktop.
3. O texto secundario nao contradiz a ficha nem depende de heuristica livre.

### Fase 8: short-link de rankings

#### Objetivo

Permitir compartilhamento curto de rankings canonicos e variantes filtradas sem obrigar o usuario a copiar query strings extensas.

#### Abordagem recomendada

1. Criar rota curta dedicada, por exemplo `/rankings/r/[token]`.
2. Usar token assinado com payload pequeno (`slug`, `cargo`, `uf`, `ordem`) em vez de introduzir persistencia obrigatoria nesta fase.
3. Redirecionar para a rota longa equivalente mantendo a canonical no destino final.

#### Dependencias

1. Definir segredo server-side dedicado (`PF_RANKING_SHORT_LINK_SALT` ou equivalente).
2. Reusar, quando fizer sentido, utilitarios do quiz para assinatura/sanitizacao, sem acoplar semanticamente rankings ao fluxo do quiz.

#### Criterios de aceite

1. O short-link abre a mesma variante do ranking de forma deterministica.
2. Links invalidos falham com resposta segura.
3. Os botoes de share podem optar pelo short-link sem quebrar o fallback para URL longa.

### Fase 9: `processos-por-gravidade`

#### Objetivo

Adicionar a quarta superficie tematica mais sensivel do produto com metodologia editorial explicita e verificavel.

#### Pre-condicoes obrigatorias

1. Documento metodologico escrito e aprovado por humano.
2. Copy da UI deixando claro que se trata de criterio editorializado e nao de fato neutro bruto.
3. Decisao tecnica sobre manter agregacao no app ou mover para view/RPC dedicada.

#### Abordagem recomendada

1. Introduzir novo `queryType` especifico ou mover direto para view/RPC, evitando condicional espalhada na page.
2. Combinar `gravidade` e `status` dos processos com pesos versionados e testados.
3. Exibir badge/metodologia visivel na page e no OG textual quando necessario.

#### Criterios de aceite

1. A metodologia existe no repo e e citada pela page.
2. O ranking tem testes de score, empate, ordenacao e regressao.
3. A pagina deixa claro que a responsabilidade editorial e humana.

## Dependencias tecnicas e editoriais por fase

1. **Fase 6**
   - sem migration nova
   - sem RPC nova
   - depende apenas de ajustes em helpers, page e testes
2. **Fase 7**
   - pode comecar sem migration nova, mas talvez exija follow-up de performance se o contexto secundario ficar caro
3. **Fase 8**
   - requer segredo server-side para assinatura
   - pode evitar banco se o token for stateless
4. **Fase 9**
   - depende de decisao editorial humana
   - pode exigir migration/view/RPC dedicada antes de ir para producao

## Riscos e mitigacoes da feature expandida

1. **Drift SEO em variantes (`cargo`, `uf`, `ordem`)**
   - mitigacao: canonical fixa na rota base e `noindex` nas variantes nao canonicas
2. **Custo de agregacao e joins extras**
   - mitigacao: medir no app primeiro; mover para view/RPC quando a metrica sair do limiar aceitavel
3. **Preview social divergente em URLs filtradas**
   - mitigacao: aceitar caveat no curto prazo ou introduzir OG dinamica por query em fase posterior
4. **Risco editorial em `processos-por-gravidade`**
   - mitigacao: bloquear implementacao ate haver metodologia e decisao humana registradas

## Validacao final esperada da feature expandida

1. `npm run test`
2. `npm run check:scripts`
3. `npm run lint`
4. `npm run build`
5. `npm run audit:release-verify`
6. Validacao manual de:
   - `/rankings`
   - um slug canonico em `desc`
   - uma variante `asc`
   - uma variante `Governador + UF`
   - OG do index e de um ranking individual
   - viewport mobile `375px` e desktop

## Ordem de execucao aprovada

1. Completar a documentacao da feature expandida neste arquivo.
2. Executar **Fase 6: ordenacao expandida**.
3. Executar **Fase 7: contexto secundario por linha**.
4. Executar **Fase 8: short-link de rankings**.
5. Executar **Fase 9: processos-por-gravidade** somente apos fechar as pre-condicoes editoriais.

## Proximo bloco de execucao

O proximo bloco aprovado para implementacao e a **Fase 6: ordenacao expandida (`desc` / `asc`)**, por ser o menor risco tecnico, nao exigir migration e preservar a ordenacao canonica atual como default.
