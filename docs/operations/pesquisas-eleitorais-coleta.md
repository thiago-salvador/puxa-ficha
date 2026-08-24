# Coleta de pesquisas eleitorais do piloto 2026

## Escopo

Este runbook cobre somente pesquisas nacionais para Presidente em 2026 do conjunto preferencial Datafolha, AtlasIntel e Ipsos-Ipec. O piloto guarda cada cenário separadamente, não calcula média, não compara turnos ou listas incompatíveis e não substitui uma fonte ausente por outro instituto.

O artefato versionado é `scripts/data/pesquisas-presidencia-2026.json`. Cada ausência usa `value: null` e `status: indeterminado`. Falha de fonte nunca vira zero.

## Rotas provadas

| Fonte | Rota | Evidência pública | Justificativa |
|---|---|---|---|
| Datafolha | `direta_automatizavel` | [Folha, 21/08/2026](https://www1.folha.uol.com.br/poder/2026/08/datafolha-lula-marca-39-no-1o-turno-e-flavio-bolsonaro-tem-33.shtml) | O HTML da contratante traz resultados e metadados em texto. Uma leitura pontual separa o cenário com Marçal do cenário sem Marçal. |
| AtlasIntel | `importacao_manual_auditada` | [relatório integral no CDN do instituto](https://cdn.atlasintel.org/498dd172-4381-4192-977c-c4af9787434f.pdf) | O PDF é estável, mas a extração textual omite os valores dos gráficos. O PesqEle confirma recursos próprios, mas a fonte continua condicional e nunca fica publicável por padrão. |
| Ipsos-Ipec | `sem_pesquisa_qualificada` | [índice oficial de eleições](https://www.ipsos.com/pt-br/topic/eleicoes) | Não há rodada nacional atual aprovada. A rodada de dezembro de 2025 é antiga e a publicação de agosto de 2026 é estadual, portanto a ausência é preservada. |

No conjunto preferencial atual, Datafolha está `aprovado`, AtlasIntel está `condicional` e Ipsos-Ipec está sem rodada nacional atual aprovada. O arquivo ainda preserva rodadas anteriores de outros institutos como evidência versionada, mas o contrato de publicação não as usa como fallback.

O registro eleitoral é conferido pelo código no [PesqEle do TSE](https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml). O portal não oferece, neste piloto, URL pública permanente por código. Por isso o código e a URL do portal ficam em campos separados.

## Atualização em quatro passes

### Passo 1: localizar e qualificar

1. Abrir o índice oficial do instituto ou a página pública da contratante.
2. Confirmar instituto, eleição, cargo, geografia, publicação e código de registro.
3. Se o instituto não publicar o resultado acessível, usar mídia pública que reproduza números e metodologia. Marcar `source_kind` sem promover a mídia a fonte primária.
4. Ler `preferred_source_ids` em `scripts/data/pesquisas-eleitorais-fontes.json`: somente fonte preferencial `aprovado` usa `publishable_by_default: true`; `condicional` exige revisão manual por rodada.

### Passo 2: capturar e normalizar

1. Baixar uma cópia temporária do HTML ou PDF e calcular SHA-256.
2. Criar um `id` de pesquisa por instituto e registro.
3. Criar um item em `cenarios` para cada turno, lista e pergunta. Nunca unir cenários.
4. Copiar cada `raw_label` literalmente e o percentual publicado.
5. Preencher todos os metadados. Campo não localizado recebe `null` e `indeterminado`.

### Passo 3: vincular sem aproximação

1. Comparar o `raw_label` com `exact_aliases` por igualdade literal.
2. Aplicar o alias somente no escopo 2026, Presidente, Brasil e no cenário em análise.
3. Sem alias literal, gravar `candidate_slug: null` e `match_status: indeterminado`.
4. Respostas como branco, nulo, outros e indecisos usam `match_status: not_candidate`.

Não remover partido, título, acento ou sufixo para forçar vínculo. `Veterinário Wilson Grassi (Democrata)` só aponta para `wilson-grassi-junior` porque esse rótulo literal foi revisado contra a identidade eleitoral de 2026. `Cabo Daciolo (Mobiliza)` continua indeterminado porque está fora do recorte presidencial atual.

### Passo 4: verificar antes de publicar o arquivo

1. Validar o JSON com `jq empty scripts/data/pesquisas-presidencia-2026.json`.
2. Validar cada linha do golden com `jq -c . tests/fixtures/pesquisas-eleitorais-golden.jsonl`.
3. Rodar `node --import tsx --test tests/pesquisas-eleitorais-golden.test.ts` quando o teste do contrato estiver presente.
4. Conferir que não existem duas chaves iguais de pesquisa, cenário e rótulo.
5. Conferir que cenários publicados têm exatamente o `comparability_key` de `publication_scope`.
6. Reabrir a URL pública e comparar ao menos um percentual, o período de campo e o registro.

Totais de 99% ou 101% podem decorrer do arredondamento publicado. Preservar os percentuais brutos e nunca corrigir a soma por conta própria.

## Tratamento de falhas

- Página fora do ar, bloqueio, erro de download ou parse: estado `erro`.
- Pesquisa real sem metadado suficiente para qualificação: campo `indeterminado`, sem preencher por contexto.
- Pesquisa fora do cargo ou geografia: não entra no arquivo.
- Pesquisa antiga mantida por referência: estado `antigo`, sem substituir silenciosamente uma rodada mais recente.
- Nenhuma rodada qualificável para uma fonte aprovada: `sem_pesquisa_qualificada`, nunca lista vazia interpretada como zero.

## Limites do piloto

Não criar scraper recorrente, browser automatizado, dependência, migration ou escrita remota. Uma mudança de rota exige provar que reduz custo sem aumentar fragilidade.
