# Settings do Puxa Ficha

Este diretório é a porta de entrada operacional do projeto. Ele existe para que
uma pessoa ou agente consiga entender o produto, mudar o código ou atualizar os
dados sem criar uma segunda verdade.

## Ordem obrigatória de leitura

1. [OBJECTIVE.md](OBJECTIVE.md): objetivo, escopo e definição de ficha completa.
2. [EXPECTED_BEHAVIOR.md](EXPECTED_BEHAVIOR.md): regras que não podem regredir.
3. [ARCHITECTURE.md](ARCHITECTURE.md): fluxo da aplicação e dos dados.
4. [SOURCES_AND_DATA.md](SOURCES_AND_DATA.md): fontes, identidade, estados e modelo.
5. [WORKFLOWS.md](WORKFLOWS.md): como desenvolver, coletar, publicar e verificar.
6. [AUTOMATIONS_AND_ENVIRONMENTS.md](AUTOMATIONS_AND_ENVIRONMENTS.md): ambientes,
   segredos e rotinas automáticas.
7. [STACK.md](STACK.md): ferramentas e versões suportadas.
8. [STATUS.md](STATUS.md): fotografia datada do estado atual e das lacunas.
9. [CANDIDATE_DATA_COMPLETENESS_WORKFLOW.md](CANDIDATE_DATA_COMPLETENESS_WORKFLOW.md):
   plano com gates para transformar auditorias e pesquisas em dados
   comprovados nas fichas de todo o universo.
10. [CANDIDATE_DATA_COMPLETENESS_EVAL.md](CANDIDATE_DATA_COMPLETENESS_EVAL.md):
    critérios pass/fail, graders, custo esperado e golden set do workflow.

## Hierarquia de autoridade

Em caso de divergência, use esta ordem:

1. Evidência atual da fonte primária e leitura direta da superfície pública.
2. Schema, migrations, código e testes do `main` atual.
3. Registro canônico de fontes em `src/data/methodology-sources.ts`.
4. Régua em `docs/cobertura-de-dados.md` e `npm run audit:cobertura`.
5. Este diretório.
6. README, comentários antigos, relatórios avulsos e memória de conversas.

`Settings/STATUS.md` é um snapshot, não uma fonte dinâmica. Quando o código, a
produção, as fontes ou a cobertura mudarem, ele deve ser atualizado no mesmo PR.

## Fonte única de verdade, e como não perdê-la

Decisão do dono em 08/08/2026. Local, GitHub e Vercel ficam alinhados, com um
lugar só respondendo cada pergunta:

| Pergunta | Fonte única |
|---|---|
| Qual o estado atual do projeto | `Settings/STATUS.md` |
| Qual versão está no ar | `/api/deployment-info`, comparado a `git rev-parse origin/main` |
| Qual a cobertura de dados | `npm run audit:cobertura` |
| Quais fontes existem | `src/data/methodology-sources.ts` |
| O que o banco tem | `supabase/migrations/` mais o ledger, hoje divergentes (issue #131) |

Três regras que decorrem disso:

- **Uma branch local só, `main`.** Branch de trabalho existe enquanto o trabalho
  existe; depois de mergear, é apagada, com o SHA registrado em `docs/arquivo/`.
  Em 07/08 havia 19 branches remotas, 17 delas superadas linha a linha.
- **`STATUS.md` não pode descrever um mundo que não existe.** Em 08/08 ele ainda
  dizia que merge e deploy estavam pendentes, depois de ambos terem acontecido.
  Snapshot velho é pior que snapshot ausente: parece informação.
- **Rótulo público e chave interna não se confundem.** Antes de reusar uma
  palavra que já tem sentido na superfície pública, checar se ela já nomeia outra
  conta em outro lugar. A renomeação de Alertas para Destaques criou dois números
  homônimos, e `tests/destaques-rotulo-sem-colisao.test.ts` existe para impedir a
  repetição.

## Contrato de manutenção

- Toda task deve passar pelo filtro de contribuição ao objetivo descrito em
  `OBJECTIVE.md` antes de entrar em execução.
- Toda mudança estrutural atualiza o arquivo correspondente deste diretório.
- Toda nova fonte só pode ser anunciada quando existe dado publicado e uma
  superfície pública que o renderiza.
- Toda automação documentada deve existir de fato em `vercel.json`, GitHub
  Actions ou outro mecanismo versionado.
- Toda alteração de versão deve atualizar `package.json`, lockfile e `STACK.md`.
- Toda mudança relevante de cobertura deve atualizar `STATUS.md` com um novo
  snapshot gerado por `npm run audit:cobertura`.
- O teste `npm run settings:check` protege a presença e os vínculos mínimos
  desta camada.

## O que não pertence aqui

Segredos, credenciais, dumps, dados pessoais sensíveis, decisões editoriais por
candidato e resultados de execução extensos não devem ser copiados para esta
pasta. Use os mecanismos e registros canônicos citados nos documentos.
