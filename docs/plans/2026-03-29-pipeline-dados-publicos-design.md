# Design: Pipeline Automatizado de Dados Publicos

**Data:** 2026-03-29
**Status:** Aprovado
**Autor:** Thiago Salvador + Claude

## Contexto

O Puxa Ficha precisa de dados oficiais atualizados sobre candidatos. Os scripts atuais sao stubs nao-funcionais. Este design define um pipeline automatizado que puxa dados de 4+ fontes oficiais e os mantem atualizados via GitHub Actions.

## Decisoes

- **Fontes:** TSE, Camara, Senado, Portal da Transparencia, + qualquer oficial facil de integrar
- **Atualizacao:** GitHub Actions cron (diario para REST, semanal para CSV)
- **Candidatos:** Lista curada em `data/candidatos.json`, dados puxados automaticamente por ID

## Arquitetura

```
data/candidatos.json (lista curada, ~10-50 candidatos)
        |
        v
scripts/ingest-all.ts (orquestrador)
   ├── lib/ingest-tse.ts        → patrimonio, financiamento, processos (CSV bulk)
   ├── lib/ingest-camara.ts     → gastos, votacoes, projetos_lei (REST)
   ├── lib/ingest-senado.ts     → votacoes, projetos_lei, mandatos (REST)
   └── lib/ingest-transparencia.ts → dados complementares (REST, API key)
        |
        v
Supabase (upsert por candidato_id)
```

## Fonte de verdade: `data/candidatos.json`

```json
[
  {
    "slug": "lula",
    "nome_completo": "Luiz Inacio Lula da Silva",
    "nome_urna": "Lula",
    "cargo_disputado": "Presidente",
    "ids": {
      "camara": null,
      "senado": null,
      "tse_sq_candidato": "280001607037"
    }
  }
]
```

Adicionar candidato = adicionar uma entrada no JSON.

## Mapeamento API → Tabela

| Tabela | Fonte | Metodo | Frequencia |
|--------|-------|--------|------------|
| candidatos | TSE CSV + Camara/Senado REST | Bulk + REST | Semanal + Diario |
| historico_politico | Senado mandatos + TSE historico | REST + CSV | Semanal |
| patrimonio | TSE bens de candidatos | CSV | Semanal |
| financiamento | TSE prestacao de contas | CSV | Semanal |
| votos_candidato | Camara votacoes + Senado votacoes | REST | Diario |
| projetos_lei | Camara proposicoes + Senado autorias | REST | Diario |
| gastos_parlamentares | Camara despesas CEAP | REST | Diario |
| processos (criminal) | TSE certidoes criminais | CSV | Semanal |

## Tabelas de curadoria manual (fora do pipeline)

| Tabela | Motivo |
|--------|--------|
| mudancas_partido | Sem API; derivar de TSE historico + contexto manual |
| votacoes_chave | Selecao editorial de quais votacoes importam |
| pontos_atencao | 100% editorial |
| processos (nao-criminal) | CNJ exige numero do processo |

## GitHub Actions

- Cron diario 8h UTC (5h BRT): Camara + Senado REST
- Cron semanal domingo 6h UTC: TSE CSV + Transparencia
- workflow_dispatch: trigger manual
- Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TRANSPARENCIA_API_KEY

## Modulos

### ingest-tse.ts
- Baixa CSVs do TSE (2018, 2022): candidatos, bens, prestacao de contas, certidoes
- Parseia Latin1 CSV com separador `;`
- Popula: patrimonio, financiamento, processos, candidatos (dados historicos)

### ingest-camara.ts
- Para cada candidato com ids.camara:
  - /deputados/{id} → perfil
  - /deputados/{id}/despesas → gastos_parlamentares
  - /deputados/{id}/votacoes → votos_candidato
  - /proposicoes?idDeputadoAutor={id} → projetos_lei
- Rate limit: 300ms entre requests

### ingest-senado.ts
- Para cada candidato com ids.senado:
  - /senador/{codigo} → perfil
  - /senador/{codigo}/votacoes → votos_candidato
  - /senador/{codigo}/autorias → projetos_lei
  - /senador/{codigo}/mandatos → historico_politico

### ingest-transparencia.ts
- Portal da Transparencia: gastos, contratos, viagens
- Requer TRANSPARENCIA_API_KEY

## Fora de escopo

- IA para gerar pontos_atencao (fase 2)
- Scraping JusBrasil/noticias (fragil, risco legal)
- Base dos Dados/BigQuery (Python, nao TypeScript)
- Dados TSE 2026 (disponivel apos 15/ago)
