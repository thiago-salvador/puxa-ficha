# Preflight do readback público da Fase 4

Data: 11/08/2026. Base: head da PR #167, `c6f41dd`.

## Veredito

O readback final ainda não podia ser executado de forma íntegra com o tooling
anterior. As provas de destaques, honestidade e cards do item 11 renderizavam o
componente local contra o banco; somente o auditor de financiamento consultava
a API e o DOM públicos, e ele usava um único viewport. Nenhum comando conferia
em uma passada ledger, SHA, cache, API, DOM, os oito casos obrigatórios e o
universo de 194 fichas.

O tooling desta branch fecha essa lacuna sem escrita remota:

- `scripts/audit/readback-publico-fase4.sh` é o runner único, `set -euo
  pipefail`, e exige `PF_DRY_RUN=1`;
- a conexão é vinculada ao projeto Supabase canônico sem expor credencial em
  argumentos de processo; o ledger completo é lido com
  `default_transaction_read_only=on`, validado pelo gate canônico e precisa
  terminar em `393|20260812123000|22`;
- os 21 readbacks SQL da release são executados separadamente e em ordem, de
  forma fail-closed;
- `readback-destaques-ficha.ts --expect-final` exige 194 fichas, 970 células,
  zero `nunca_verificado`/`nao_coletado` e as 29 fichas sem card preservadas;
- `readback-financiamento-universo.ts` compara banco, API, DTO e DOM nas 194
  fichas tanto em desktop quanto em mobile;
- `readback-publico-fase4.ts` confere `/api/deployment-info`, `cache-control`,
  identidade da API, geometria e conteúdo integral dos cards, processos e suas
  fontes, trajetória, timeline, votos, os dois inventários e as seis subabas de
  legislação, além dos estados de destaques, em 194 fichas por dois viewports;
- o host público é fixado em `https://puxaficha.com.br`, o ambiente precisa ser
  `production`, e o SHA completo precisa coincidir ao mesmo tempo com o
  deployment, com um checkout local limpo e com `refs/heads/main` no origin;
- redirects de API e página são recusados, configurações TLS herdadas são
  neutralizadas e o conteúdo integral dos painéis, inclusive Justiça, é
  comparado ao caminho público canônico sem cache;
- Daciolo, Flávio, Hertz, Lula, Renan, Zema, Rui e Samara são obrigatórios.
  Omar Aziz e Robério Paulino são a amostra adversarial fora dos exemplos.

## Provas executadas antes do deploy

- 53/53 testes focais preexistentes passaram.
- 17/17 testes executáveis do contrato final passaram. As mutações quebram de verdade
  o runner para host ou projeto incorreto, ambiente não produtivo, SHA ou
  checkout divergente, ledger trocado, readback ausente, universo diferente de
  194, apenas um viewport, cache incorreto, defeito de DOM, quantidade diferente
  de 970 células, estado silencioso, trajetória extra, processo sem fonte,
  conteúdo ou link visível adulterado, cache com assinatura diferente do banco,
  fonte judicial privada, redirect imediato ou tardio de API/DOM, conteúdo
  judicial ou de subaba legislativa divergente, inclusive card oculto, texto,
  link, payload ou navegação quebrada depois do 25º item,
  branch publicada diferente de `main` e processo descendente sobrevivendo ao watchdog.
- A suíte integral integrada terminou em 3.026/3.026 testes depois do
  endurecimento e da correção global de identidade.
- typecheck, check de scripts, Settings, ESLint sem warnings, sintaxe shell e
  `git diff --check` passaram.
- O readback local somente leitura percorreu 194/194 fichas. O estado atual
  ainda tem 293 pleitos sem coleta e 293 células silenciosas em destaques: 88
  de trajetória, 29 de patrimônio e 176 de votações.
- O auditor público endurecido percorreu os oito casos obrigatórios e
  Omar/Robério em desktop e mobile contra o SHA publicado `7e3e416` e o
  reprovou, como esperado, porque o deploy anterior ainda não contém os
  marcadores integrais dos cards nem os dados finais.
- Dois controles negativos foram exercitados. `--expect-final` reprovou o site
  atual porque os estados públicos ainda não foram publicados; o gate local
  reprovou com `silenciosas=293/0`. Portanto o runner não fabrica verde antes
  das migrations e do deploy.
- A reconstrução canônica, sem cache, das 194 fichas encontrou cinco perfis já
  degradados por integridade de timeline partidária: `coronel-busnello`,
  `jeremias-cosmo`, `joao-rodrigues`, `orleans-brandao` e `renan-filho`.
  O gate final os recusa; eles não foram convertidos em estado saudável por
  tolerância do auditor. A PR #168 prepara a correção global: 639/639 SQs
  auditados, 6 âncoras sem identidade removidas, 7 UFs históricas explicitadas
  e 3 âncoras TSE 2026. Orleans Brandão foi separado do governador homônimo e
  permanece entre as 194 fichas por declaração pública rastreável de
  pré-candidatura, sem tratar `#NULO` como candidatura registrada ou deferida;
  `cargo_atual` fica nulo, e fontes oficiais distintas provam o cargo exercido
  em 2025 e a exoneração em 2026. As migrations `20260811102000` e
  `20260811102100` ainda não foram aplicadas.

## Comando exato pós-deploy

Execute no mesmo SHA publicado, depois das migrations e das duas coletas:

```bash
PF_DRY_RUN=1 \
PF_DATABASE_URL="$PF_DATABASE_URL" \
PF_PUBLIC_SITE_URL="https://puxaficha.com.br" \
PF_EXPECTED_DEPLOY_SHA="SHA_COMPLETO_PUBLICADO" \
npm run audit:fase4:readback
```

Qualquer divergência interrompe o runner. A saída só pode converter a matriz
em verde quando terminar com `PASS` e os artefatos do diretório informado no
stdout forem anexados ao fechamento. Resíduos `erro`, `indeterminado` e
`sem_achado_no_escopo` continuam explícitos; o gate não os converte em ausência.

## Lacunas que dependem do release

O passe completo de 194 x 2 não pode passar antes das migrations restantes, do
deploy do mesmo SHA, do backfill de CPF e da coleta de sanções. A matriz e o
`Settings/STATUS.md` só devem ser atualizados para o estado final depois desse
readback. Nenhum desses atos foi executado nesta frente.

[confidence: high, source: execução local e readback público somente leitura]
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
