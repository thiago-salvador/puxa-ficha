# Puxa Ficha — Proximos passos

> Para Claude Code: leia este doc + CLAUDE.md no inicio da sessao.

## Estado atual (29/03/2026)

- **Site live:** https://puxa-ficha.vercel.app
- **Repo:** https://github.com/thiago-salvador/puxa-ficha (11 commits)
- **Supabase:** projeto `wskpzsobvqwhnbsdsmok` (sa-east-1), 15 candidatos, 412 rows do pipeline
- **Pipeline:** Camara + Senado funcionando. TSE CSV ainda nao rodou. GitHub Actions configurado.
- **Curadoria:** 8 votacoes-chave, 6 pontos de atencao (minimo, precisa expandir)
- **Notion task:** `330caadac1ce817ebf31da7eaef94073`
- **Vault note:** `15-Projetos/puxa-ficha.md`

## Prioridade 1: Dados (completar pipeline)

### 1.1 Rodar TSE CSV (patrimonio + financiamento)

```bash
cd /Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha
export SUPABASE_URL="https://wskpzsobvqwhnbsdsmok.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="(pegar do .env.local)"
npx tsx scripts/ingest-all.ts tse
```

Vai baixar ZIPs do TSE (2018, 2022), parsear CSVs Latin1, popular tabelas `patrimonio` e `financiamento`. Esperar ~5min por download.

Se der erro de matching de nomes (TSE usa UPPERCASE), ajustar `normalizeForMatch` em `scripts/lib/helpers.ts` ou adicionar mais variantes no match.

### 1.2 Expandir pontos de atencao

Hoje: 6 pontos (Bolsonaro 2, Flavio 1, Marcal 2, Caiado 1). Meta: 5-10 por candidato.

Inserir via Supabase dashboard (SQL Editor) ou script. Formato:

```sql
INSERT INTO pontos_atencao (candidato_id, categoria, titulo, descricao, gravidade, verificado, gerado_por, fontes)
VALUES (
  (SELECT id FROM candidatos WHERE slug = 'lula'),
  'contradição',
  'Titulo do ponto',
  'Descricao detalhada com contexto',
  'alta',
  true,
  'curadoria',
  '[{"titulo": "Fonte", "url": "https://...", "data": "2026-01-01"}]'::jsonb
);
```

Categorias validas: `corrupção`, `contradição`, `financiamento_suspeito`, `mudança_partido`, `processo_grave`, `patrimonio_incompativel`

### 1.3 Popular votacoes dos candidatos

O pipeline buscou votacoes mas nao matchou nenhuma com `votacoes_chave` porque as 8 votacoes inseridas nao tem `proposicao_id` preenchido. Precisa:

1. Buscar o ID da proposicao na API da Camara/Senado pra cada votacao-chave
2. Atualizar `votacoes_chave.proposicao_id` com esses IDs
3. Re-rodar o pipeline (`npx tsx scripts/ingest-all.ts camara senado`)

## Prioridade 2: Design e UX

### 2.1 Design visual

O frontend e funcional mas usa o tema padrao do shadcn (neutro). Proximo passo:

- Definir paleta de cores propria (sugestao: tons escuros + vermelho pra alertas)
- Logo/identidade visual
- OG images dinamicas por candidato (pra compartilhamento em redes)

Usar skill `/frontend-design` no Claude Code pra isso.

### 2.2 Busca funcional

O campo de busca na Home esta desabilitado. Implementar:

- Client component com `useState` pra filtrar candidatos por nome/partido
- Sem backend, filtro local (15 candidatos cabem no client)

### 2.3 Mobile

Testar e ajustar layout mobile. A tabela do Comparador precisa de scroll horizontal em telas pequenas (ja tem `overflow-x-auto`). Ficha Corrida deve funcionar bem por ser vertical.

## Prioridade 3: Expansao

### 3.1 Governadores

Adicionar candidatos a governador em `data/candidatos.json`. Comecar com SP, MG, RJ, BA, RS. Buscar IDs nas APIs da Camara e Senado pra quem for/foi parlamentar.

### 3.2 Dominio puxaficha.com.br

Configurar no Vercel:
```bash
vercel domains add puxaficha.com.br
```
Depois configurar DNS no Registro.br apontando pra Vercel.

### 3.3 Grant Mozilla (deadline 15/abr)

Preparar proposta pro Mozilla Democracy x AI Challenge (US$ 50K, top 2 ganham US$ 250K). O site live e um diferencial enorme. A proposta deve enfatizar:
- Ja funciona (nao e so ideia)
- Dados publicos oficiais, pipeline automatizado
- Perspectiva de classe, linguagem acessivel
- Codigo aberto

## Prioridade 4: Melhorias tecnicas

### 4.1 Gastos parlamentares (Camara)

O pipeline buscou gastos mas nao inseriu pra os 3 ex-deputados (Bolsonaro, Ciro, Caiado) porque a API retorna dados desagregados por nota fiscal. O modulo agrega por ano, mas precisa:

- Verificar se os dados de despesas estao sendo inseridos corretamente
- Adicionar despesas de legislaturas anteriores (2019-2022) via download CSV bulk da Camara

### 4.2 Processos judiciais

Tabela `processos` esta vazia. Fontes:
- TSE certidoes criminais (via CSV, ja no pipeline mas precisa do download)
- Curadoria manual dos processos mais relevantes (STF, STJ, TRE)

### 4.3 Historico de partidos (mudancas_partido)

Tabela vazia. Nao tem API. Derivar de:
- Comparar partido do candidato entre eleicoes 2014, 2018, 2022 (CSVs do TSE)
- Curadoria manual do contexto (janela partidaria, fusao, etc.)

## Referencia rapida

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Dev server localhost:3000 |
| `npm run build` | Build producao |
| `npx tsx scripts/ingest-all.ts` | Pipeline completo (todas fontes) |
| `npx tsx scripts/ingest-all.ts camara senado` | So REST APIs (rapido) |
| `npx tsx scripts/ingest-all.ts tse` | So TSE CSV (lento) |
| `vercel --prod` | Deploy producao |
| `supabase db push` | Push migrations pro Supabase |

| Credencial | Onde esta |
|------------|-----------|
| Supabase keys | `.env.local` (local) + Vercel env vars (prod) |
| GitHub secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Supabase dashboard | https://supabase.com/dashboard/project/wskpzsobvqwhnbsdsmok |
| Vercel dashboard | https://vercel.com/thiagosalvador/puxa-ficha |

## Arquivos importantes

| Arquivo | O que e |
|---------|---------|
| `CLAUDE.md` | Documentacao completa do projeto |
| `data/candidatos.json` | Lista curada de candidatos com IDs das APIs |
| `scripts/ingest-all.ts` | Orquestrador do pipeline |
| `scripts/lib/ingest-*.ts` | Modulos de ingestao por fonte |
| `scripts/schema.sql` | Schema do banco (fonte de verdade) |
| `src/lib/api.ts` | Camada de dados (Supabase + mock fallback) |
| `src/lib/types.ts` | TypeScript types do frontend |
| `docs/plans/2026-03-29-pipeline-dados-publicos-design.md` | Design do pipeline |
