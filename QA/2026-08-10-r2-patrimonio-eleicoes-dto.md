# R2: patrimônio por eleição, do banco até o DOM

Branch `rc-r2-patrimonio-dto`, nascida de `rc-lancamento` em `aa40b68`.
Correção da aba Dinheiro exibindo "ainda não coletado" para eleição cuja
ausência já tinha sido conferida no pacote oficial do TSE.

Itens da nota PF Ajustes envolvidos: 11 (Hertz Dias), 16 (Rui Costa Pimenta),
17 (Samara Martins). O item 9 (Flávio Bolsonaro) foi medido e não se reproduz,
detalhe na seção "O que ficou fora".

## Causa raiz, camada por camada

A hipótese que abriu a trilha era que `CandidatoProfile` recompunha
`patrimonio_eleicoes` por um algoritmo próprio. Não é isso. O componente já
chamava `buildPatrimonioEleicoes`, a mesma função canônica do DTO. O defeito
estava um andar acima: ele chamava a função certa **com o insumo que o payload
público não carrega**.

| Camada | O que acontecia |
|---|---|
| Banco | `patrimonio` tem as declarações; `patrimonio_ausencia_oficial` guarda a eleição cuja ausência foi conferida no pacote do TSE, com `fonte_url` e `verificado_em`. Os dois estavam corretos. |
| `src/lib/api.ts` | `getCandidatoBySlug` lia as duas tabelas e entregava `patrimonio` e `patrimonio_ausencias_oficiais` na ficha. Correto, e nunca compunha a série. |
| `src/lib/public-profile-dto.ts` | `toPublicCandidatoProfileDto` compunha `patrimonio_eleicoes` corretamente a partir dos dois insumos, e **publicava só a série derivada**. `patrimonio_ausencias_oficiais` não entra no DTO. Correto por desenho, e é aqui que o insumo morre. |
| `/api/candidato-profile/[slug]` | Serve o DTO. Este é o payload que o browser recebe. |
| `DeferredCandidatoProfileClient` | Busca essa rota e passa o resultado como `ficha` para `CandidatoProfile`. A ficha do cliente **não é** a ficha do servidor. |
| `CandidatoProfile` | Recompunha: `buildPatrimonioEleicoes(patrimonio, ficha.patrimonio_ausencias_oficiais ?? [], ficha.historico)`. No cliente esse campo é `undefined`, então a lista de ausências chegava vazia. |
| DOM | Sem as ausências, todo ano `vazio_confirmado` caía no ramo final da função e virava `nao_coletado`. A tela trocava "o pacote oficial foi conferido e não traz registros", com fonte e data, por "a coleta ainda não foi realizada". |

Duas composições, e nenhuma das duas servia as duas rotas: `CandidatoProfile`
recompunha (quebrava no payload público, funcionava no preview);
`ProfileOverview` lia `ficha.patrimonio_eleicoes` por cast (funcionava no
payload público, devolvia lista vazia no preview e no embed, escondendo a
eleição). `EmbedWidget` recompunha como o primeiro.

O erro que a série cometia não era exibir um número errado. Era rebaixar
"verificamos e não existe" para "ainda não olhamos", que é uma afirmação mais
fraca do que a que tínhamos como provar, e apagava a fonte primária junto.

## O que mudou

Uma composição só, feita onde os três insumos existem, e um ponto único de
leitura.

- **`src/lib/types.ts`**: `PatrimonioEleicaoEstado` e `PatrimonioEleicaoPublico`
  passam a morar aqui, e `FichaCandidato` ganha `patrimonio_eleicoes?`. O campo
  é opcional porque ficha montada à mão (teste, readback, preview) não o traz.
- **`src/lib/api.ts`**: `getCandidatoBySlug` compõe a série uma vez, com
  `patrimonioConfiavel`, `patrimonioAusenciasOficiais` e `historicoConfiavel`, e
  a entrega na ficha. Nada mudou na degradação nem no `unstable_cache`: o campo
  é dado derivado dos mesmos insumos, e nenhum caminho novo devolve recurso
  degradado ou lista vazia de dentro do cache.
- **`src/lib/public-profile-dto.ts`**: novo `resolvePatrimonioEleicoes(ficha)`,
  ponto único de leitura. Se a ficha traz a série composta, ela vence; senão
  recompõe dos insumos crus. `toPublicCandidatoProfileDto` passou a usá-lo, então
  o DTO propaga a série do servidor em vez de recompor.
- **`src/components/CandidatoProfile.tsx`**, **`ProfileOverview.tsx`**,
  **`EmbedWidget.tsx`**: as três superfícies leem por `resolvePatrimonioEleicoes`.
  O helper local `getPatrimonioEleicoesDaFicha` de `ProfileOverview` morreu.
- **`src/components/CandidatoProfileSections.tsx`**: `patrimonioEleicoesSemDado`
  passa a ser a lista já filtrada, para os três gates de montagem abrirem só
  quando existe linha a mostrar, em vez de abrir moldura vazia.

### Teste que mudou de expectativa

`tests/patrimonio-eleicoes-ui.test.tsx` tinha o caso "ProfileOverview sem
patrimonio_eleicoes e sem bens mantém teaser de patrimônio oculto". Essa
expectativa codificava o defeito: em ficha sem o campo composto (preview, embed,
readback) a eleição disputada sumia da visão geral. Virou "recompõe a eleição a
partir dos insumos crus", e ganhou um caso irmão provando que ano anterior a
2006 continua fora, porque a série `bem_candidato` do TSE começa ali.

## Prova: readback antes e depois

`scripts/audit/readback-patrimonio-eleicoes.ts`, só leitura, sobre
`candidatos_publico`. Renderiza `CandidatoProfile` com `renderToStaticMarkup`
**sobre o payload do DTO**, não sobre a ficha do servidor, e lê os atributos do
DOM. Medir sobre a ficha do servidor mede um payload que nenhum visitante
recebe, e foi assim que o defeito passou pelas rodadas anteriores.

Universo confirmado: **194 fichas** em `candidatos_publico`.

| Medida | Antes | Depois |
|---|---|---|
| Fichas com ao menos uma eleição defeituosa | **39** | **0** |
| Eleições defeituosas | **61** | **0** |
| Banco tem dado e o DOM dizia "não coletado" | 48 | 0 |
| Banco tem dado e o DOM omitia a eleição | 13 | 0 |
| Ausências confirmadas exibidas com fonte e data | **0 de 61** | **61 de 61** |

Os 13 omitidos eram o caso em que o ano existia **só** por causa da linha de
ausência: sem ela no payload, o ano não entrava nem no conjunto e desaparecia da
tela por inteiro.

Evidência bruta em `QA/evidencias/2026-08-10-r2-patrimonio-eleicoes/`
(`antes.json`, `antes-stdout.txt`, `depois.json`, `depois-stdout.txt`).

### Casos nomeados

| Slug | Banco | DOM antes | DOM depois |
|---|---|---|---|
| `flavio-bolsonaro` | 2018, 2016, 2014, 2010, 2006 publicados | idem, sem defeito | idem, sem defeito |
| `hertz-dias` | 2022 e 2020 ausência conferida; 2018 publicado | 2022 e 2020 como "ainda não coletado", sem fonte nem data | 2022 e 2020 como ausência conferida, com fonte e data |
| `rui-costa-pimenta` | 2014 ausência conferida; 2010 e 2006 publicados | 2014 como "ainda não coletado" | 2014 como ausência conferida, com fonte e data |
| `samara-martins` | 2022 publicado; 2020 ausência conferida | 2020 como "ainda não coletado" | 2020 como ausência conferida, com fonte e data |

Hertz Dias mantém 2010 como "ainda não coletado" depois da correção, e está
certo: ele disputou vice-governo em 2010 e o banco não tem nem declaração nem
conferência para aquele ano. Pendência declarada é a resposta honesta ali.

## Teste de regressão

`tests/patrimonio-eleicoes-payload-publico.test.tsx`, 7 casos, nomeados pelos
itens da nota. Atravessam a mesma fronteira da produção: montam a ficha do
servidor, passam por `toPublicCandidatoProfileDto` e renderizam o componente
real sobre o resultado.

Contra o código velho: **6 de 7 falham**. O sétimo é o de Flávio Bolsonaro, que
passa nos dois lados porque a ficha dele nunca teve o defeito. Contra o código
novo: 7 de 7 passam.

## Gates

| Gate | Exit |
|---|---|
| `npm test` (2789 testes, 2789 passam) | 0 |
| `npm run check:dead-code` | 0 |
| `npm run build` | 0 |
| `npx tsc --noEmit` | 0 |
| `readback-patrimonio-eleicoes.ts` sobre as 194 | 0 |

Uma execução intermediária da suíte acusou `tests/backfill-historico-integration.test.ts`
com código 143 (o subprocesso estourou o tempo sob carga paralela). Não é
regressão desta trilha: o arquivo passa isolado, a suíte na base limpa
(`git stash`) passou 2781 de 2781, e a execução final com todas as mudanças
aplicadas passou 2789 de 2789. Flutuação de tempo, não comportamento.

## O que ficou fora

- **Item 9 (Flávio Bolsonaro), não reproduzido.** As cinco eleições dele
  (2006, 2010, 2014, 2016, 2018) têm patrimônio publicado **com** detalhamento
  de bens no banco (2, 9, 3, 7 e 5 bens), e as cinco aparecem na aba com os bens
  itemizados. Não há eleição disputada sem detalhamento na ficha dele hoje. Se o
  item apontava para outra superfície de dinheiro (composição de financiamento,
  por exemplo), é trabalho fora desta trilha e segue aberto.
- **Migration, backfill e ingest**: nada. A correção é de leitura e
  apresentação, nenhuma escrita em banco.
- **Coleta de 2010 do Hertz Dias**: continua pendente de verdade. Fechar isso é
  trabalho de ingest, não de superfície.
- Nada foi tocado em `recortes.json`, baselines, `supabase/migrations/`,
  `supabase/rollback/`, e-mail, votações-chave, destaques ou autoria.
