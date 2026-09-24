# Importação manual auditada de pesquisas

Rota para publicar rodadas de pesquisa de Presidente (BR) e Governador (UF) lidas diretamente
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

## Execução

```bash
npm run pesquisas:importar -- --input rodadas.json --aliases aliases.json
npm run pesquisas:importar -- --input rodadas.json --aliases aliases.json --write
```

Sem `--write`, o comando só valida e mostra o plano. Com `--write`, atualiza os catálogos e o
scorecard de fontes. Rodadas com registro já catalogado são puladas.

Depois de gravar: `npm run test:pesquisas`, `npm run audit:pesquisas:gate` e conferência das
páginas `/` e `/uf/<uf>#pesquisas` no deploy.
