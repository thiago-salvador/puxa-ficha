# Fontes com pipeline pronto e sem entrega publicada

Este arquivo existe por causa do achado A0.3 da auditoria de integridade de
2026-07-24 (`docs/auditoria-integridade-2026-07-24.md`): a pagina `/metodologia`
anunciava ao publico uma fonte que nunca produziu uma linha de dado nem tinha
onde aparecer no site.

A regra que passa a valer: **fonte so aparece em `/metodologia` quando ha dado
publicado E superficie que renderiza esse dado.** Enquanto faltar um dos dois, a
fonte fica aqui, com o caminho de volta escrito.

---

## Cadastro de Sancoes da CGU (CEIS, CNEP, CEAF) - RELIGADA em 2026-08-05

Removida de `src/data/methodology-sources.ts` na etapa 2C (2026-07-25) e
reinserida em 2026-08-05, quando as duas condicoes da regra do cabecalho
passaram a valer ao mesmo tempo. O CEPIM saiu do pipeline na PR #85: o cadastro
so filtra por CNPJ e so devolve pessoa juridica, entao o CPF de um candidato
jamais poderia casar.

### Situacao verificada em 2026-08-05

| Item | Estado |
|---|---|
| Ingest | corrigido na PR #85: parametros `codigoSancionado`/`cpfSancionado` (o `cpfCnpj` antigo era ignorado em silencio pela API) + conferencia de identidade de cada registro retornado |
| Credencial | `TRANSPARENCIA_API_KEY` definida como secret do GitHub em 2026-08-05 (o `ingest.yml` ja a le) |
| Tabela `public.sancoes_administrativas` | 0 linhas, e isso agora e achado, nao lacuna: a varredura corrigida consultou os candidatos com CPF valido e nao achou sancao |
| Proveniencia | `coleta_log_ultima` (fonte `transparencia-sanctions`) registra o desfecho por candidato: `vazio_confirmado` para quem foi consultado nos tres cadastros, `erro` para quem nao tem CPF valido |
| Componente que renderiza | existe: `src/components/SancoesSection.tsx`, na aba Justica da ficha |
| Prova negativa na tela | o bloco mostra "Nada encontrado nos cadastros CEIS, CNEP e CEAF (verificado em DD/MM/AAAA)" quando a ultima coleta e `vazio_confirmado`, e estado neutro sem afirmacao de limpeza quando nunca verificado |
| Leitura da proveniencia | `coleta_log_ultima` nao tem grant para `anon` de proposito; a ficha le via service role no server (`fetchSancoesVerificacao` em `src/lib/api.ts`), e falha degrada para o estado neutro |
| Card em /metodologia | reinserido: id `transparencia-sancoes`, `updateFrequency: "sob demanda"` (lote manual via `workflow_dispatch`, sem cron) |

### O que continua pendente

1. **Ponto de atencao de sancao com fonte publica.** O guard
   `motivoRecusaDeFonte` continua recusando o ponto de atencao gerado pelo
   ingest, porque a rota consultada e API autenticada e a migration
   `20260725160000` exige fonte com URL publica para gravidade alta ou critica.
   Quando existir sancao real, anexar em `fontes` a URL publica do Portal da
   Transparencia que mostra a sancao.
2. **Os candidatos sem CPF valido continuam inverificaveis** (desfecho `erro`
   na `coleta_log`). So o CPF do TSE fecha essa lacuna; a ficha deles mostra o
   estado neutro, que e o correto.

---

## DECISAO de 2026-08-05 sobre as duas fontes mortas

O dono aprovou resolver a ambiguidade "o ingest roda, nao da erro e devolve sem
dados". A decisao NAO foi a mesma para as duas, porque a situacao delas nao e a
mesma, e o criterio que separou foi um so: **a fonte ja pos dado no ar?**

| | Jarbas / Serenata | CEAPS Senado |
|---|---|---|
| Endpoint hoje | **HTTP 522** (Cloudflare de pe, origem fora) | **HTTP 404** na rota de despesas |
| Linhas publicadas por ela | **0** em `pontos_atencao` | **102** em `gastos_parlamentares` (65 em fichas publicaveis) |
| Tentativas em `coleta_log` | **30 erros aplicáveis em 1 rodada semanal real** | 10 |
| Card em `/metodologia` | **REMOVIDO** | **MANTIDO** |
| Ingest | mantido; grava `erro` para aplicáveis e `nao_aplicavel` para quem não tem ID da Câmara | mantido, agora grava `erro` / `indeterminado` |

**Por que o card do Jarbas saiu.** E exatamente o achado A0.3 que criou este
arquivo: a pagina anunciava ao publico uma fonte que nunca produziu uma linha.
Somado ao endpoint fora do ar, o card prometia ao leitor uma verificacao de
gasto suspeito que nunca aconteceu para ninguem. `tests/ui-claims-copy-contract.test.ts`
passou a travar a volta dele sem dado junto.

**Por que o card do CEAPS ficou.** Aqui removeria a procedencia de numero que
esta no ar agora: 102 linhas de gasto parlamentar que a ficha e o comparador
mostram. A rota de ATUALIZACAO caiu; o dado publicado nao sumiu. Tirar o card
deixaria o leitor sem saber de onde veio o valor que ele esta lendo, que e o
oposto do que este arquivo existe para evitar.

**Por que nenhum dos dois ingests foi removido.** Remover apaga junto as guardas
de identidade escritas em 05/08 e os testes que as cobrem, e 522 e 404 nao provam
descontinuacao definitiva. O que muda e o silencio: os dois passam a declarar o
desfecho em `coleta_log`, entao "fonte morta" para de ser indistinguivel de
"procuramos e nao achamos".

**Criterio objetivo para remover o ingest do Jarbas depois** (antes nao havia
nenhum, e por isso a pergunta ficou aberta): agora que cada rodada grava `erro`,
se `coleta_log` mostrar `fonte = 'jarbas'` com `resultado = 'erro'` em **8
rodadas semanais consecutivas** sem nenhuma `encontrado` no meio, a API esta
descontinuada de fato e o ingest sai junto com o tipo, o teste e a entrada aqui.
Consulta que responde isso:

```sql
select date_trunc('week', executado_em) semana, resultado, count(*)
  from coleta_log where fonte = 'jarbas'
 group by 1, 2 order by 1 desc;
```

Estado em 2026-08-05: **1 de 8 rodadas semanais reais**. A rodada consultou os
30 candidatos públicos com ID da Câmara e recebeu HTTP 522 para todos. Não houve
`encontrado` nem `vazio_confirmado`. Os outros 164 candidatos públicos ficaram
como `nao_aplicavel`; eles não entram na contagem das oito rodadas.
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

---

## Fontes com endpoint morto (verificado em 2026-08-05)

Estas duas não são lacuna de curadoria nem de credencial: o endpoint saiu do ar.
Os ingests continuam no repositório e registrados em `scripts/ingest-all.ts`.
Falha de servidor precisa aparecer como `erro`, nunca como ausência de dado.

Achado durante a auditoria que seguiu o falso positivo em massa do ingest de
sancoes (2026-08-04): as duas foram checadas com chamada real ao tentar fechar o
mesmo tipo de guarda de identidade nelas.

### Jarbas / Serenata de Amor (`scripts/lib/ingest-jarbas.ts`)

| Item | Estado |
|---|---|
| Endpoint | `https://jarbas.serenata.ai/api/chamber_of_deputies/reimbursement` |
| Verificação 2026-08-05 | **HTTP 522** na raiz, `healthcheck`, `/api/`, rota integrada e rota legada; Cloudflare responde, mas a origem não |
| Domínios alternativos | `jarbas.serenatadeamor.org` e `api.serenata.ai` não resolvem; `serenata.ai/api/reimbursement/` responde 404 |
| Conjunto atual | 194 candidatos públicos; **30 aplicáveis** por ID da Câmara e 164 não aplicáveis |
| Comportamento do ingest | HTTP 404, 5xx, DNS, timeout e JSON inválido viram `erro`; candidato sem ID da Câmara vira `nao_aplicavel` |
| Guarda de identidade | `conferirReembolsos` recusa a resposta inteira se algum `applicant_id` divergir do consultado |

O que este ingest gravava quando funcionava: `pontos_atencao` com gravidade alta
ou media e texto de acusacao nomeada ("a IA Rosie identificou reembolsos
suspeitos"). A guarda nova recusa a resposta inteira quando qualquer registro
vier com `applicant_id` de outro deputado, porque a URL filtra por parametro de
query e nada comparava o retorno. Se a API voltar num formato diferente, e a
guarda que impede o pior caso.

Investigação de substituto em 2026-08-05: o repositório separado do Jarbas está
arquivado desde 2018; o repositório integrado informa que Rosie, Jarbas e a
infraestrutura recebem atualizações menos frequentes; não há release ou issue
que anuncie migração de API. O próprio código documenta `reimbursements.xz` e
`suspicions.xz` como arquivos gerados ao rodar Rosie, não como dataset público
mantido. Os buckets públicos candidatos testados responderam 404. O snapshot
CSV público encontrado no GitHub contém dados de 2017 e não serve como fonte
atual para os candidatos de 2026. Portanto, nenhuma substituição preserva hoje
a semântica, a identidade oficial e a citabilidade exigidas.

Para religar: exigir endpoint ou dataset oficial atualizado que traga
reembolsos, suspeições e `applicant_id`. Sem isso, manter o ingest apenas durante
as oito rodadas semanais reais e depois aplicar o critério de remoção acima.

### CEAPS Senado (`scripts/lib/ingest-ceaps-senado.ts`)

| Item | Estado |
|---|---|
| Endpoint | `https://legis.senado.leg.br/dadosabertos/senador/{id}/despesas?ano=` |
| Verificacao 2026-08-05 | **HTTP 404** com corpo `No static resource dadosabertos/senador/{id}/despesas`, para todo id testado |
| Rotas irmas | `/senador/{id}` e `/senador/lista/atual` seguem **200**, ou seja o servico esta no ar e a rota de despesas mudou ou saiu |
| Comportamento do ingest | `fetchJSON` lanca, o catch avisa no stderr e devolve `null`, que o chamador loga como "sem dados" |
| Guardas de identidade | adicionadas em 2026-08-05 (`agregarDespesasDoAno`) |

Duas guardas entraram junto, porque os dois defeitos existiam
independentemente do endpoint estar fora:

1. `IdentificacaoParlamentar` estava tipado como `Record<string, unknown>` e
   nunca era lido. O payload diz de quem sao as despesas e o codigo gravava o
   que viesse.
2. O codigo somava na linha do ano PEDIDO qualquer ano que a API devolvesse. O
   comentario antigo tratava isso como comportamento conhecido e aceitavel ("a
   API as vezes retorna o ano solicitado, as vezes outros"), o que e evidencia
   de filtro nao confiavel, nao licenca para confiar nele. Bloco sem `NumAno`
   entra no mesmo descarte: despesa de ano desconhecido somada na linha do ano
   pedido e o mesmo erro sem nem a evidencia de qual ano foi somado.

**Falha de rede continua indistinguivel de fonte vazia, e a correcao nao e
aqui.** `fetchJSON` repete e lanca em timeout, DNS, 5xx, 429 e JSON invalido; o
catch de `fetchDespesasAno` trata todos como `null`, e o chamador loga "sem
dados" igual a um 404. Separar 404 dos demais dentro deste ingest resolveria um
ingest so, e o buraco existe em varios (`jarbas` e o proprio `sancoes` sem
credencial tem o mesmo catch). A correcao estrutural e o `coleta_log`, que
registra a TENTATIVA e tem `erro` e `indeterminado` como desfechos distintos de
`vazio_confirmado`. Enquanto o CEAPS estiver 404 em todo id, nenhum dos dois
caminhos grava dado, entao a distincao so passa a valer quando a rota voltar.

Para religar: achar a rota atual de despesas CEAPS no portal de dados abertos do
Senado (ou o CSV equivalente) e apontar `BASE_URL` para ela. As guardas ja estao
prontas para o formato novo, e `tests/ingest-guards-identidade.test.ts` cobre as
duas.

### Contraprova: a Camara nao tem esse problema

Testado no mesmo dia, e o resultado importa para nao espalhar guarda onde nao
precisa. `https://dadosabertos.camara.leg.br/api/v2/proposicoes`:

- honra o filtro (`idDeputadoAutor=0` e `idDeputadoAutor=999999999` devolvem 0 registros);
- **rejeita parametro desconhecido** com erro, em vez de ignorar em silencio
  (`idDeputadoAutorX=204554` nao volta lista).

E o oposto do Portal da Transparencia, que ignora parametro desconhecido e
devolve a lista nacional. As rotas de gastos e votos da Camara usam path param
(`/deputados/{id}/despesas`), onde id errado da 404 e nao dado de outra pessoa.
Por isso nenhuma guarda nova foi adicionada em `ingest-camara.ts`.

---

## Nota sobre cadencia das demais fontes

Atualizado em 2026-07-29 (verificacao original: 2026-07-25):

- `.github/workflows/ingest.yml` ganhou `schedule: 0 6 * * 3` (quartas): ingere
  camara+senado e revalida o Data Cache publico ao final. TSE e demais fontes
  continuam por `workflow_dispatch`.
- Outros workflows agendados: `link-check-fontes.yml` (segundas, URLs de fontes
  de pontos de atencao) e `data-quality.yml` (quintas: IDs camara/senado vs API
  oficial + audits de superficie publica; dia 3 do mes: SQ do seed vs
  consulta_cand do TSE).
- `vercel.json` tem 4 crons: `/api/alerts/send-digest`, `/api/news/refresh`,
  `/api/internal/published-consistency` e `/api/internal/runtime-smoke`. Apenas
  o segundo ingere dado de fonte publica.

Em `/metodologia`: Google News diz "diaria" (cron da Vercel), Camara e Senado
dizem "semanal" (schedule do ingest). O resto segue "sob demanda", que descreve
o que de fato acontece: lote manual. Rotulo sobe ou desce junto com o cron, no
mesmo commit.
