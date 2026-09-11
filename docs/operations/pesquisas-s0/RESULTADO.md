# S0: correções locais verificadas, captura completa bloqueada

Data: 2026-09-09. Branch local `codex/pesquisas-s0-coleta`, base `afe6c954f83e8435fdd652fb43148d5298e5e40d`. Worktree `/private/tmp/pf-pesquisas-s0`.

## Resultado

Foram corrigidos os três defeitos reproduzíveis apontados na revisão: política de robots, leitura de amostra/campo e exit code da consolidação bloqueada. Os testes passam. **S0 operacional permanece incompleto**: não houve captura reconciliada com o TSE nem execução do código corrigido no GitHub.

## O que mudou

- Robots com HTTP 4xx indisponível permite consultar uma origem previamente aprovada, conforme a opção prevista na RFC 9309, seção 2.3.1.3. HTTP 408/429, 5xx, falha de rede e Disallow continuam bloqueando. HTTP 403 no próprio conteúdo continua erro. Não foram alterados allowlist, retries ou credenciais.
- O parser reconhece as redações de amostra observadas no R7 e o trecho da Folha que coloca o primeiro dia antes de “início do levantamento”. Datas inferidas a partir do mês da publicação são verificadas quanto a validade, ordem e limite da publicação. A interpretação existente de intervalos explícitos foi preservada.
- `consolidate` grava proposta, diff, resumo e outputs e então encerra com código 1 quando o status é `blocked`. `no_changes` permanece exit 0 e zero operações. O upload de diagnóstico já tinha `if: always()` no workflow.
- Dezoito regressões S0 entram no comando de testes já executado pelo workflow. Não houve mudança em catálogos, interface, cron ou permissões.

Referência: [RFC 9309, 2.3.1.3](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3.1.3). A regra permite acesso quando robots está indisponível; não transforma um erro do recurso em autorização.

## Provas locais

| Verificação | Resultado |
|---|---|
| Antes da correção, regressões S0 | 7 falhas em 16 testes; defeitos reproduzidos |
| Depois da correção, regressões S0 | 18 testes aprovados, incluindo CLI blocked e no_changes |
| `npm run verify:pesquisas:monitoramento` | PASS: golden, TSE, S0, isolamento, rede, workflow e auditoria |
| `npm run test:pesquisas:atualizacao-agendada` | 20 testes aprovados; propostas e duplicação verificadas com dependências simuladas |
| ESLint dos quatro arquivos TypeScript envolvidos | PASS, zero alertas |
| `tsc --noEmit -p tsconfig.scripts.json` | PASS |
| `npm run build` com Node 24 | PASS, incluindo TypeScript; aviso de depreciação preexistente do import Sentry |
| `git diff --check` | PASS |
| Unlazy L1 a L4, reexecutados | ALL MET, 4/4 |

O ledger [GATES.md](GATES.md) contém os hashes das saídas. O [EVAL.md](EVAL.md) distingue esses resultados da prova operacional. Testes de promoção usam simulação; nenhum PR real foi produzido por eles.

## Capturas reais e bloqueios remanescentes

1. **Amazonas antes da correção**, 11:07:09 UTC: a página respondeu, mas o parser informou `amostra ausente`; robots do TSE respondeu 403. Collector exit 1, zero evidências completas.
2. **Amazonas depois**, 11:09:58 UTC: a leitura da amostra avançou, mas o parser informou `resultados ausente`. A matéria usa `Roberto Cidade (União Brasil)`, enquanto a expressão existente exige sigla em maiúsculas; a lista também tem espaço antes de `:`. O corpo consultado não trouxe método de coleta reconhecível. O TSE passou da etapa robots e respondeu 403 na própria página do dataset. Collector exit 1.
3. **Datafolha nacional depois**, 11:10:32 UTC: o período de campo avançou, mas faltou `confiança`. O corpo consultado não forneceu esse metadado no texto pesquisado. A página e o robots da Folha responderam localmente; isso não comprova a hipótese de bloqueio de IP do GitHub. TSE dataset novamente 403. Collector exit 1.
4. **Alternativas públicas do TSE**: a API CKAN retornou 403. O link de download foi confirmado na página oficial através da pesquisa web, mas o ZIP público também retornou 403 na consulta local. Não houve download verificável do registro, nem preenchimento com valores do catálogo.

Fontes consultadas:

- [R7, pesquisa do Amazonas](https://noticias.r7.com/eleicoes/2026/amazonas-omar-aziz-lidera-com-34-no-1-turno-roberto-cidade-tem-22-e-maria-do-carmo-21-26082026/).
- [Folha, Datafolha nacional](https://www1.folha.uol.com.br/poder/2026/08/datafolha-lula-marca-39-no-1o-turno-e-flavio-bolsonaro-tem-33.shtml).
- [TSE, dataset de pesquisas 2026](https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026).
- [TSE, ZIP oficial](https://cdn.tse.jus.br/estatistica/sead/odsele/pesquisa_eleitoral/pesquisa_eleitoral_2026.zip).

As fixtures S0 são sintéticas, adaptadas com redação observada nessas páginas. Não são cópias integrais das publicações nem evidência de captura completa.

### Artefatos do collector

| Arquivo local | SHA-256 do proposal.json |
|---|---|
| `/private/tmp/pf-pesquisas-s0-before/proposal.json` | `ddd0da46fe5c547fb18ecb44bac6964baa4092223982a206a5affc64ffdb067c` |
| `/private/tmp/pf-pesquisas-s0-after-am/proposal.json` | `8e8b1f4dcea48ff8952a6f4fbfeeb38e2a5196b7516106ae09641c6df82c3983` |
| `/private/tmp/pf-pesquisas-s0-after-br/proposal.json` | `4f7e9e704aa4e7506ec08f179b3764e66e3c52e870632c9c28d747e1bd01c42b` |

Todos contêm `evidence: null`, revisão humana obrigatória e nenhuma evidência elegível. Os hashes acima são dos diagnósticos, não de uma pesquisa validada.

## Próxima ação delimitada

Publicar somente a branch de correção e executar o workflow `pesquisas-monitoramento.yml` em `workflow_dispatch`, nessa branch, para um alvo aprovado, com `create_draft_pr=false`. Inspecionar status, logs e artefatos do SHA publicado para distinguir a falha local do comportamento no runner. Isso depende de autorização para alterar o estado remoto; não inclui merge, ativação de variável, mudança de cron ou atualização do site.

Depois, completar a evidência ausente com documentação pública primária e reconciliação acessível. Falha factual ou de fonte permanece bloqueio. Descoberta de novas pesquisas e aumento de frequência continuam posteriores à prova completa do S0.

Registro de execução: confiança alta para código, testes e respostas observadas; causa do HTTP 403 não determinada. [confidence: alta, source: diff local, processos de testes/build e consultas HTTP desta sessão] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
