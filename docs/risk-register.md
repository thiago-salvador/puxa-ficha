# Registro de Riscos e Inventario de Ativos

Documento base para ISO/IEC 27001:2022. Lista ativos criticos, riscos identificados e controles existentes.

**Data de elaboracao**: 2026-04-03
**Responsavel**: Thiago Salvador
**Proxima revisao**: 2026-07-01

---

## Inventario de ativos

### Aplicacao

| Ativo | Tipo | Localizacao | Responsavel | Classificacao |
| --- | --- | --- | --- | --- |
| App Next.js (puxaficha.com.br) | Aplicacao web | Vercel | Thiago | Publico |
| Supabase PostgreSQL | Banco de dados | Supabase Cloud (us-east-1) | Thiago | Confidencial (contém CPF) |
| Pipeline de ingestao (scripts/) | Scripts TypeScript | GitHub (repo privado) | Thiago | Interno |
| Pipeline de auditoria factual | Scripts TypeScript | GitHub | Thiago | Interno |
| Dados mock (src/data/mock.ts) | Dados estaticos | GitHub | Thiago | Interno (dev only) |

### Segredos e tokens

| Secret | Onde esta | Quem acessa | Rotacao |
| --- | --- | --- | --- |
| SUPABASE_URL | Vercel env vars | Server components, pipeline | Nao rotaciona (URL fixa) |
| SUPABASE_ANON_KEY | Vercel env vars | Server components | Sob demanda |
| SUPABASE_SERVICE_ROLE_KEY | Vercel env vars + GitHub Secrets | Pipeline (scripts) | Sob demanda |
| PF_PREVIEW_TOKEN | Vercel env vars | Preview API | Sob demanda |
| TRANSPARENCIA_API_KEY | GitHub Secrets | Pipeline (transparencia) | Sob demanda |
| ANTHROPIC_API_KEY | Vercel env vars | Nao usado em producao (fase 2) | N/A |
| VERCEL_TOKEN | Implicito (Vercel CLI) | Deploy | Gerenciado pela Vercel |
| GitHub token | GitHub Actions | CI/CD | Gerenciado pelo GitHub |

### Infraestrutura de terceiros

| Provedor | Servico | Certificacoes | Responsabilidade do projeto |
| --- | --- | --- | --- |
| Vercel | Hosting, CDN, Edge | SOC 2 Type II, ISO 27001 | Configuracao de env vars, headers, deploy |
| Supabase | PostgreSQL, Auth, RLS | SOC 2 Type II | Schema, RLS policies, queries, retencao |
| GitHub | Repositorio, CI/CD, Secrets | SOC 2 Type II | Permissoes, branch protection, secrets |
| Cloudflare (via Vercel) | DNS, DDoS | SOC 2, ISO 27001 | Configuracao DNS |

---

## Registro de riscos

### R01: Exposicao de CPF via superficie publica

| Campo | Valor |
| --- | --- |
| Probabilidade | Baixa (mitigado) |
| Impacto | Critico |
| Risco residual | Baixo |
| Controles existentes | RLS bloqueia CPF para anon/authenticated. Views publicas nao incluem CPF. Auditoria realizada em 2026-04-01 (`docs/2026-04-01-supabase-anon-audit.md`) |
| Acao adicional | Revisao periodica de RLS a cada 30 dias. Alerting se nova tabela for criada sem RLS |

### R02: Vazamento de SUPABASE_SERVICE_ROLE_KEY

| Campo | Valor |
| --- | --- |
| Probabilidade | Baixa |
| Impacto | Critico (acesso total ao banco, bypass de RLS) |
| Risco residual | Medio |
| Controles existentes | Secret em env vars (Vercel + GitHub Secrets). Nunca no codigo. .env.local no .gitignore |
| Acao adicional | Rotacionar apos cada incidente. Implementar alerting de uso anomalo via Supabase logs |

### R03: Pontos de atencao gerados por IA com informacao incorreta

| Campo | Valor |
| --- | --- |
| Probabilidade | Media |
| Impacto | Alto (desinformacao sobre politico, risco reputacional e legal) |
| Risco residual | Medio |
| Controles existentes | Flag `gerado_por: "ia"`, badge visivel na ficha individual, flag `verificado`, gate `publicavel` no candidato e bloqueio publico para itens `gerado_por = "ia"` enquanto `verificado = false` |
| Acao adicional | Completar revisao humana dos 150 pontos restantes, expandir a transparencia para outras superficies relevantes e formalizar a politica de uso editorial de IA |

### R04: Indisponibilidade em periodo eleitoral

| Campo | Valor |
| --- | --- |
| Probabilidade | Media (picos de trafego, ataques DDoS) |
| Impacto | Alto (missao do projeto e servir durante eleicao) |
| Risco residual | Alto (sem BCP formal) |
| Controles existentes | ISR (paginas pre-geradas), Vercel Edge CDN, Cloudflare DDoS basico |
| Acao adicional | BCP basico (lote 5). Definir RTO/RPO. Testar failover antes de outubro |

### R05: Pipeline de ingestao injeta dados errados

| Campo | Valor |
| --- | --- |
| Probabilidade | Media |
| Impacto | Alto (dados errados sobre candidato) |
| Risco residual | Medio |
| Controles existentes | Auditoria factual (`scripts/audit-factual-*.json`), UNIQUE constraints, upsert idempotente, coluna `publicavel` como gate |
| Acao adicional | Implementar diff report pos-pipeline (comparar antes/depois). Alerting se campo critico mudar (nome, partido) |

### R06: Scraping massivo e exfiltracao de dados

| Campo | Valor |
| --- | --- |
| Probabilidade | Media (dados publicos, alvo natural) |
| Impacto | Baixo (dados ja sao publicos, exceto CPF que esta protegido) |
| Risco residual | Baixo |
| Controles existentes | Vercel rate limiting basico, RLS para dados sensiveis |
| Acao adicional | Avaliar rate limiting mais agressivo se trafego anomalo for detectado |

### R07: Dependencia de provedores sem redundancia

| Campo | Valor |
| --- | --- |
| Probabilidade | Baixa |
| Impacto | Alto (Supabase down = site sem dados, Vercel down = site offline) |
| Risco residual | Medio |
| Controles existentes | ISR com paginas em cache. Mock fallback em dev |
| Acao adicional | BCP basico (lote 5). Avaliar snapshot periodico do banco |

---

## Revisoes

| Data | Revisor | Mudanca |
| --- | --- | --- |
| 2026-04-03 | Thiago Salvador | Criacao inicial |
