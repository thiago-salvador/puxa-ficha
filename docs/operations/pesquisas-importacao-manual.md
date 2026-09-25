# Importação manual auditada de pesquisas

Rota para publicar rodadas de pesquisa de Presidente (BR), Governador e Senado (UF) lidas diretamente
na publicação do instituto ou de veículo de imprensa, sem depender do monitor automatizado.
O site agrupa as rodadas por semana (segunda a domingo, pela data de fim do campo) e exibe a
média simples das pesquisas distintas da mesma série (`src/lib/poll-weeks.ts`).

## Entrada

Um arquivo JSON com uma lista de rodadas:

```json
[{
  "uf": "BR",
  "instituto": "Quaest",
  "contratante": "Genial Investimentos",
  "registration": "BR-01234/2026",
  "fieldwork_start": "2026-09-18",
  "fieldwork_end": "2026-09-21",
  "publication_date": "2026-09-23",
  "sample_size": 2004,
  "population": "eleitores",
  "margin_error_pp": 2,
  "confidence_percent": 95,
  "method": "Entrevistas presenciais domiciliares",
  "result_url": "https://...",
  "supporting_urls": [],
  "capture_file": "caminho/para/captura.txt",
  "scenarios": [{
    "kind": "estimulado",
    "label_raw": "Primeiro turno estimulado",
    "question": null,
    "results": [{ "raw_label": "Nome impresso", "value_percent": 38 }]
  }]
}]
```

- `capture_file` guarda o trecho literal da publicação com números e metodologia; o hash vai para o catálogo.
- Percentuais são do total da amostra. Campos não publicados ficam `null`, nunca inferidos.
- Rodadas marcadas com `"status": "nao_confirmada"` são ignoradas.
- O rótulo publicado é gerado ("Intenção de voto estimulada no 1º turno; percentuais do total de entrevistados"); `label_raw` da coleta não vai ao site, porque costuma repetir a manchete. Quando a rodada tem mais de um cenário estimulado, cada um precisa de `note` com a diferença objetiva (ex.: `"sem Fulano"`).

E um arquivo de decisões de alias por escopo (`"BR"` ou a sigla da UF): cada nome impresso aponta
para o slug do candidato, ou `null` para linhas que não são candidatos (brancos, nulos, indecisos,
outros). Nome sem decisão bloqueia a importação.

```json
{ "BR": { "Lula": "lula", "Brancos e nulos": null } }
```

## Senado

Rodadas de Senado levam `"cargo": "Senador"` e a UF. Como cada eleitor tem dois votos em 2026,
todo cenário estimulado declara `"measure"`: `"primeiro-voto"`, `"segundo-voto"` ou `"agregado"`
(soma das duas menções; o total pode chegar a 200%). Cenários espontâneos de Senado não são
importados.

Todo cenário `agregado` declara `"base"` a partir do texto capturado: `"total_mencoes"` quando a
publicação diz que os dois votos foram somados e reduzidos a 100% (rótulo "percentuais do total de
menções"), `"total_amostra"` quando os percentuais são do total de entrevistados. A base nunca é
inferida pela soma; a soma só confere a declaração e a rodada é recusada quando a contradiz
(menções acima de 102%, soma de dois votos sobre entrevistados abaixo de 130%). Sem frase que
sustente a base, o cenário agregado não é importado. As duas bases nunca entram na mesma série.
Primeiro e segundo voto ficam em `total_amostra`. A página `/uf/<uf>/senado` só publica rodada com registro TSE informado, então o
importador recusa a rodada sem ele. Método e população seguem a regra de Governador: `null`
quando a publicação não os traz.

As decisões de alias do Senado ficam no escopo `"SEN-<UF>"`, separado do escopo de Governador:

```json
{ "SEN-SP": { "Simone Tebet": "tse-2026-250002551502", "Nenhum": null } }
```

A média semanal junta institutos diferentes que mediram o mesmo voto sobre a mesma base, como em
Governador. UF sem rodada qualificada recebe ausência checada e datada com
`--ausencias ausencias.json` (lista de `{ "uf": "AC", "cargo": "Senador", "checked_at": "2026-09-25" }`).

## Execução

```bash
npm run pesquisas:importar -- --input rodadas.json --aliases aliases.json
npm run pesquisas:importar -- --input rodadas.json --aliases aliases.json --write
```

Sem `--write`, o comando só valida e mostra o plano. Com `--write`, atualiza os catálogos e o
scorecard de fontes. Rodadas com registro já catalogado são puladas.

Depois de gravar: `npm run test:pesquisas`, `npm run audit:pesquisas:gate` e conferência das
páginas `/` e `/uf/<uf>#pesquisas` no deploy.
