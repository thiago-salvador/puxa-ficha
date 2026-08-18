# QA da sessão: correções de ficha pública

Data: 2026-08-07  
Branch: `codex/profiles-complete-2026`

## Escopo

Foram tratadas duas frentes de interface pública:

1. Charts de financiamento com números quebrando no donut, legenda duplicada e rótulos longos truncados.
2. Marcadores técnicos do TSE, como `#NULO#` e `#NE#`, aparecendo como texto em bens declarados, incluindo o caso observado na ficha de Hertz Dias.

## Alterações

- `src/components/DonutChart.tsx`
  - O centro do donut passou a exibir somente `Total`.

- `src/components/ProfileOverview.tsx`
  - A legenda duplicada foi removida.
  - Valores e percentuais passaram a compartilhar uma única legenda.
  - Rótulos longos deixaram de ser truncados.
  - O layout passou a se adaptar melhor a telas estreitas.

- `src/lib/public-text.ts`
  - Foi criado um sanitizador compartilhado para remover marcadores técnicos `#NULO#` e `#NE#` de textos públicos.

- `src/lib/person-level-dedupe.ts`
  - A normalização compartilhada de patrimônio sanitiza tipo e descrição dos bens antes da deduplicação.

- `src/lib/public-profile-dto.ts`
  - O DTO público aplica a mesma sanitização aos bens e textos editoriais.

- `src/components/CandidatoProfileSections.tsx`
  - Descrições ausentes aparecem como `Descrição não informada`.
  - Tipos ausentes aparecem como `Tipo não informado`.

## Verificação

- `npm run settings:check`: 5 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado, com 2 warnings preexistentes fora dos arquivos alterados.
- `npm test`: 2.121 testes aprovados, 0 falhas.
- `npm run build`: aprovado.
- Testes focados de DTO e deduplicação: 10 testes aprovados.
- A validação visual anterior dos charts cobriu Edmilson Costa e ACM Neto em desktop e mobile.
- O Playwright do ajuste de `#NULO#` foi executado, mas o servidor local respondeu em estado degradado, sem carregar os dados da ficha; não foi uma falha do patch.

## Estado e limites

Não foram executadas migrations, escritas no banco, deploy, publicação editorial, push ou alterações em produção.

As alterações locais preexistentes em `DonutChart.tsx` e `ProfileOverview.tsx` foram preservadas. O trabalho foi registrado também na Daily Note de 2026-08-07.

## Sessão atual: neutralização de histórico judicial sem mérito

### Achado

Foi auditada a superfície pública de 194 candidatos. Foram encontrados dois pontos de atenção que descrevem situações judiciais revertidas ou anuladas sem julgamento de mérito, mas ainda contavam como alertas graves:

- Lula: ações penais da Lava Jato anuladas pelo STF por incompetência do juízo de Curitiba.
- Fernando Haddad: condenação em primeira instância revertida pelo TRE-SP por falta de provas.

### Alterações preparadas

- Criada `supabase/migrations/20260807054000_neutralizar_historico_judicial_sem_merito.sql`.
- Os dois registros permanecem visíveis, mas passam para gravidade `baixa`, fora do contador de alertas graves.
- O histórico da decisão editorial é preservado em `dados_relacionados`.
- Criados testes para a migration e para garantir que uma informação judicial histórica de baixa gravidade não entre em `alertasGraves`.

### Verificação

- `npm test`: 2.125 testes aprovados, 0 falhas.
- `npm run typecheck`: aprovado.
- `npm run settings:check`: aprovado.
- `npm run build`: concluído com sucesso.
- `git diff --check`: aprovado.
- A migration foi reconhecida pelo parser de allowlist com os dois writes esperados.

### Limite operacional

Antes da autorização, a migration não havia sido aplicada. O `localhost:3000` usa o projeto Supabase remoto compartilhado `puxa-ficha`; não há um banco Supabase local ativo nem containers Docker em execução. A aplicação exigiu autorização porque atualiza esse banco remoto.

O audit global de allowlist também encontrou uma inconsistência preexistente em `20260805123929_aplicar_decisoes_editoriais_20260805.sql`, fora do escopo desta alteração.

## Atualização: marcadores técnicos públicos

### Auditoria e ação

- O recorte remoto de `candidatos_publico` contém 194 candidatos públicos.
- Foram encontradas 333 ocorrências de `#NULO#`/`#NE#` em 53 linhas públicas: 317 em `patrimonio.bens[].descricao` e 16 em `historico_politico.observacoes`.
- Foi executado `scripts/normalizar-marcadores-publicos.ts --apply`, limitado aos `candidato_id` publicados. Nenhuma linha foi apagada; apenas os marcadores técnicos foram removidos dos dois campos auditados.
- O readback confirmou zero marcador restante nesses campos.

### Readback público

- Hertz Dias: API local `200`, `sourceStatus=live`, patrimônio de 2018 no valor de `100000`, descrição vazia e sem `#NULO#`/`#NE#`.
- O dry-run posterior confirmou `affected=0` em patrimônio e histórico.
- `supabase db push --dry-run` revelou divergência no histórico de migrations remoto, por isso a limpeza foi executada pelo script de serviço com escopo fechado e readback, sem alterar o histórico de migrations.

### Atualização após autorização

- A migration foi aplicada com sucesso no projeto Supabase `puxa-ficha`.
- O readback do banco confirmou Lula e Haddad com gravidade `baixa`, ainda visíveis, e com o registro editorial de neutralização preservado.
- A API local do Lula respondeu `200` e retornou o ponto do STF com gravidade `baixa`.
- A validação Playwright confirmou o card visível com selo `BAIXA`, sem selo `CRÍTICA` e sem seção `ALERTAS GRAVES`.
- Rota validada: `http://localhost:3000/candidato/lula?tab=alertas`.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
