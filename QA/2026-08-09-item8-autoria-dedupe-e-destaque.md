# Item 8: dedupe de autoria legislativa e promoção ao box destacado

Trilha C, branch `trilha-c`, rebasada sobre o tip de `base-lancamento`
(`21dd9c3`). Só o item 8. Os itens 4/14 e 7 não foram tocados.

## O que o print mostrava, e o que o dado mostra

A nota fala em "4 REQs idênticos listados, nada no box destacado". Lendo
`projetos_lei` em 09/08/2026, o caso é maior do que o print cabia:

- `cabo-daciolo` tem **204** proposições autorais, 58 delas projeto de lei, e
  **zero** com `destaque` editorial.
- **25** linhas são o mesmo requerimento de inclusão da PEC 446/09 na pauta do
  Plenário, reapresentado entre 2016 e 2018. Elas se dividem em dois textos que
  só diferem pelo ponto final, e é por isso que a chave de identidade normaliza
  pontuação de fim.
- O "nada no box destacado" tinha causa medível: a ementa do requerimento pontua
  **3** na heurística de relevância (`/pol[ií]cia/` e `/policiais?/` casam as
  duas em "Policiais", mais "Bombeiros"), exatamente o corte. As 25 linhas
  entravam como 25 candidatos de score idêntico e, no desempate por data, as de
  2018 passavam na frente do PL 1656/2015. O recorte saía com **1** projeto de
  lei e 5 ementas repetidas em 10 vagas.

## O que mudou

`src/lib/proposicao-dedupe.ts` (novo), `src/lib/legislacao-profile-groups.ts` e
`ProjetoLeiList` em `src/components/CandidatoProfileSections.tsx`.

**Nenhuma linha é descartada.** O acervo persistido continua a verdade
auditável, os contadores (`Legislação 206`, `Propôs 204`) continuam medindo o
acervo inteiro, e o cartão colapsado declara quantas linhas ele representa e
quais são.

Duas regras distintas, com chaves distintas, de propósito:

| Superfície | Chave | Regra | Por quê |
|---|---|---|---|
| Lista (inventário, Propôs) | sigla + ementa, restrita a siglas de ementa própria | agrupa só quando é reapresentação do mesmo ato | mostrar 25 cartões idênticos é ruído, mas afirmar identidade exige a sigla |
| Box de destaques | ementa pura, SEM sigla | uma vaga por texto | o box promete recorte de relevância; dois cartões de mesmo texto não informam duas coisas, seja qual for a sigla |

Dentro de um grupo textual do box, a vaga é da linha com `destaque` editorial;
na falta dela, do projeto de lei; no empate, da primeira na ordem de entrada.
Caso real que a chave sem sigla pega e a com sigla mascarava: `joao-roma` tem a
mesma proposta como PL 4854/2019, PL 4995/2019, PLP 219/2019 e PLP 220/2019,
texto idêntico nas quatro, e o par PL/PLP ocupava duas vagas.

E a precedência do recorte passou a ser dura: ato normativo (projeto de lei,
mais qualquer linha com `destaque` editorial) ocupa vaga antes de proposição
acessória. Requerimento, indicação e emenda só entram no que sobrar.

### O achado que mudou o desenho

A primeira versão agrupava por ementa em qualquer sigla, e o readback devolveu
3.685 linhas colapsadas, com grupos de 147 e 118. Fui conferir antes de aceitar:

- `helder-salomao`, 147 linhas de **EMC** de 2025 com a ementa "Dispõe sobre o
  Sistema Portuário Brasileiro" e **144 números diferentes**.
- `efraim-filho`, 87 **EMC** com "Altera o Sistema Tributário Nacional".

São emendas **distintas ao mesmo projeto**: a ementa gravada numa emenda é a da
proposição hospedeira, não a dela. Chamar isso de "apresentada 147 vezes" seria
trocar um erro de leitura por uma afirmação falsa sobre a atuação de uma pessoa
real. O agrupamento passou a valer só para siglas cuja ementa identifica o
próprio ato (as normativas mais REQ, RIC, RCP, INC, PFC, SUG), com default de
**não** agrupar em sigla desconhecida. O número honesto caiu de 3.685 para 222.

## Readback local contra dados reais

`scripts/audit/readback-autoria-dedupe.ts` (novo, só leitura) reimplementa o
recorte antigo lado a lado com o novo e compara ficha a ficha. 103 fichas com
acervo autoral.

A repetição é medida por texto puro, sem sigla, com a mesma normalização do
módulo: incluir a sigla na régua do readback mascararia o caso PL/PLP acima
(com a régua velha, o "antes" acusava 19 fichas; a honesta acusa 21).

| Medida | Antes | Depois |
|---|---|---|
| Linhas colapsadas na lista | 0 | 222, em 48 fichas |
| Maior grupo colapsado | (nenhum) | 25 (`cabo-daciolo`) |
| Fichas com texto repetido no box, régua sem sigla | 21 | **0** |
| Projetos de lei no box, somando as fichas | 208 | **263** |
| Fichas com nenhum projeto de lei no box | 45 | 41 |
| Fichas com box vazio | 18 | 18 |

O dedupe entre tipos mudou o box de exatamente 2 fichas em relação à versão
com chave por sigla: `joao-roma` (9 para 7 cartões) e `rodrigo-pacheco` (8 para
7), ambas perdendo só cartões de texto repetido. As demais 101 fichas, o
`cabo-daciolo` incluído, ficaram idênticas, então os screenshots continuam
retratando o comportamento atual.

`cabo-daciolo`: acervo 204 → 178 cartões (26 linhas colapsadas), 0 ementas
repetidas no box (antes 5), 4 projetos de lei no box (antes 1).

10 fichas perderam vagas no box, e isso é o efeito pretendido: eram vagas
gastas com texto repetido. `marcio-franca` era o pior caso, 6 das 10.

**Box vazio continua 18 e isso não é regressão do item 8.** Nenhuma ficha
passou a ter box vazio; as 18 já não tinham proposição acima do corte. Encher
esse box é o item 4/14, e o critério lá é estado vazio honesto, não estado
vazio zero.

## Provas rodadas

Todas no worktree `../puxa-ficha-trilha-c`, com `npm ci` próprio.

| Prova | Resultado |
|---|---|
| `tests/proposicao-dedupe.test.ts` (novo, 21 casos) | 21 pass, 0 fail |
| Suíte completa | **2547 pass, 0 fail** |
| `npm run check:dead-code` | exit 0, `--max-issues 0` |
| `npm run settings:check` | 7 pass, 0 fail |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| Reprodução do print, ficha real em `localhost:3030` | 2 screenshots em `QA/evidencias/2026-08-09-item8-autoria/` |

A reprodução é a ficha do `cabo-daciolo` renderizada contra o banco de produção
em leitura, depois do carregamento client-side das 204 linhas:
`data-pf-legislation-total=204`, `grupos=178`, `linhas-colapsadas=26`, e o
cartão do REQ 9344/2018 exibindo "Apresentada 25 vezes com a mesma ementa entre
2016 e 2018" com os 24 identificadores listados.

Dois testes merecem nota porque quase nasceram inúteis: o de "requerimento
repetido não ocupa mais de uma vaga" passava sozinho enquanto eu supunha que a
ementa real pontuava 2, e só virou teste de verdade depois de eu medir que
pontua 3; ele agora tem um controle explícito que falha se a ementa deixar de
alcançar o corte.

## O que NÃO foi feito

Sem push, sem merge, sem migration, sem deploy, sem coleta. Nada de dataset
editorial novo: item 8 é código, não conteúdo. Itens 4/14 e 7 intocados.

## Para a Raiz

1. **Rebase já feito, o branch descende do tip.** O worktree nasceu de
   `21a83dd`, antes de `21dd9c3` (adendo de DoD) entrar, e por isso o diff
   contra `base-lancamento` mostrava o adendo como removido. Rebasei sobre o
   tip, sem conflito. `git merge-base --is-ancestor base-lancamento trilha-c`
   passa. O conteúdo de código é byte a byte o do `1af2924` que você aprovou:
   `git diff 1af2924 <tip> -- src/ tests/ scripts/` sai vazio, e a única
   diferença fora do adendo é a linha do `settings:check` no receipt.
2. **Conflito potencial com a Trilha D.** Editei `ProjetoLeiList` em
   `src/components/CandidatoProfileSections.tsx` (linhas ~890-1100). O card de
   "Patrimônio declarado" da Trilha D vive no mesmo arquivo, nas linhas ~98-250.
   Regiões distintas, merge deve resolver sozinho, mas confira.
3. **`.claude/launch.json` do checkout compartilhado** ganhou uma entrada
   `trilha-c` na porta 3030. É arquivo não versionado; nada foi commitado.
4. **Só fecha no readback contra dados reais depois da Trilha A e B.** O
   readback acima é contra o banco de produção lido hoje. Se a Trilha B rodar
   backfill que acrescente proposições, os números da tabela mudam e o readback
   precisa rodar de novo (`npx tsx scripts/audit/readback-autoria-dedupe.ts`).
5. **Achado que sobra para os itens 4/14, não corrigido aqui.** A ementa gravada
   em EMC é o texto da emenda com preenchimento de pontilhados
   ("EMENDA Nº À PEC Nº 287/2016 ... Art. 1º ...........") e ela aparece no box
   de destaques do `cabo-daciolo` como se fosse resumo de proposta. É qualidade
   de heurística de destaque, não dedupe.
6. **Ordem de exibição do box** continua cronológica, decidida por
   `ProjetoLeiList` desde antes. Minha mudança governa **quais** 10 entram, não
   em que ordem aparecem. Se a Raiz quiser projeto de lei no topo visual, é uma
   linha no `sort` e vale decidir junto com os itens 4/14.
