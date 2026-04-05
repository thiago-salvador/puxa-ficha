# Plano de Continuidade de Negocios (BCP)

Plano minimo para garantir disponibilidade do PuxaFicha durante o periodo eleitoral de 2026.
Baseado em ISO 22301:2019, adaptado para o porte do projeto.

**Data de elaboracao**: 2026-04-03
**Responsavel**: Thiago Salvador
**Proxima revisao**: 2026-08-01 (antes do pico eleitoral)

---

## Servicos criticos

| Servico | Descricao | Impacto se indisponivel |
| --- | --- | --- |
| Site publico (puxaficha.com.br) | Interface de consulta para eleitores | Total: sem acesso a informacao |
| Banco de dados (Supabase) | Armazenamento de todos os dados | Parcial: ISR serve paginas em cache, mas sem dados frescos |
| Pipeline de ingestao | Atualizacao diaria/semanal de dados | Baixo a curto prazo: dados ficam defasados mas nao somem |
| Deploy (Vercel) | CI/CD e hosting | Total: sem deploy de correcoes, mas site em cache continua servindo |

---

## RTO e RPO

| Servico | RTO (tempo maximo offline) | RPO (perda maxima de dados) | Justificativa |
| --- | --- | --- | --- |
| Site publico | 4h | 0 (ISR cache) | Em periodo eleitoral, 4h e o maximo aceitavel. Fora de eleicao, 24h |
| Banco de dados | 8h | 24h (ultima ingestao) | Dados mudam pouco (pipeline diario). Perder 1 dia e aceitavel |
| Pipeline de ingestao | 48h | 24h | Pipeline pode ser re-executado. Dados publicos nao se perdem |
| Deploy | 4h | 0 (ultimo deploy funcional) | Rollback via Vercel e instantaneo |

---

## Cenarios e respostas

### C01: Vercel fora do ar

**Probabilidade**: muito baixa (Vercel tem SLA 99.99%)
**Impacto**: site offline

**Resposta**:
1. Verificar status em status.vercel.com
2. Se outage confirmado e > 1h: comunicar nas redes sociais que o site esta temporariamente indisponivel
3. Se outage > 4h: avaliar deploy emergencial em alternativa (Netlify, Cloudflare Pages)
4. Pos-incidente: documentar e avaliar se redundancia vale o custo

**Preparacao**:
- [ ] Manter `vercel.json` e config compativel com deploy rapido em outra plataforma
- [ ] Testar build em Netlify ao menos uma vez antes de outubro

### C02: Supabase fora do ar

**Probabilidade**: baixa
**Impacto**: site mostra dados em cache (ISR), mas novas paginas nao sao geradas

**Resposta**:
1. Verificar status em status.supabase.com
2. Site continua servindo via ISR cache (revalidate 1h, paginas pre-geradas em build)
3. Se outage > 8h: ativar mock fallback em producao (flag de env) se necessario
4. Pos-incidente: verificar integridade dos dados apos restauracao

**Preparacao**:
- [ ] Garantir que mock fallback funciona em producao (hoje so ativa em dev)
- [ ] Implementar snapshot semanal do banco (pg_dump via cron ou Supabase backup)

### C03: Pipeline de ingestao quebra

**Probabilidade**: media (APIs externas mudam, CSVs do TSE mudam formato)
**Impacto**: dados ficam defasados, mas site continua funcionando

**Resposta**:
1. GitHub Actions notifica falha por email
2. Diagnosticar: API mudou? CSV mudou formato? Rate limit?
3. Corrigir script e re-executar manualmente
4. Se correcao demora > 48h: publicar aviso no site sobre dados potencialmente desatualizados

**Preparacao**:
- [ ] Adicionar alerting mais explicito (Slack webhook ou email) para falhas de pipeline
- [ ] Manter log de ultima execucao bem-sucedida visivel

### C04: DDoS ou trafego anomalo

**Probabilidade**: media (site politico em ano eleitoral e alvo natural)
**Impacto**: site lento ou offline

**Resposta**:
1. Verificar metricas na Vercel (Analytics, logs)
2. Cloudflare (via Vercel) mitiga DDoS basico automaticamente
3. Se ataque sofisticado: ativar modo "Under Attack" no Cloudflare (se DNS proprio) ou contatar Vercel
4. Se necessario: restringir pais de origem ou ativar rate limiting agressivo

**Preparacao**:
- [ ] Configurar rate limiting no Vercel (se disponivel no plano)
- [ ] Documentar processo de ativacao de protecao extra

### C05: Comprometimento de credenciais

**Probabilidade**: baixa
**Impacto**: critico (acesso ao banco, dados de CPF)

**Resposta**: ver `docs/lgpd-incident-playbook.md` (playbook de incidentes)

**Preparacao**:
- [ ] Rotacionar todos os secrets a cada 90 dias como pratica preventiva
- [ ] Ativar 2FA em todas as contas (Supabase, Vercel, GitHub)

### C06: Dados incorretos publicados (erro de pipeline ou IA)

**Probabilidade**: media
**Impacto**: alto (desinformacao sobre candidato, risco legal)

**Resposta**:
1. Identificar o dado incorreto e a fonte
2. Corrigir no banco (UPDATE direto via Supabase dashboard)
3. Forcar redeploy para regenerar paginas ISR
4. Se dado impactou candidato: comunicar proativamente e documentar

**Preparacao**:
- [ ] Completar revisao humana dos pontos de atencao gerados por IA (168 pendentes)
- [ ] Implementar diff report pos-pipeline

---

## Backup e recuperacao

| O que | Como | Frequencia | Onde |
| --- | --- | --- | --- |
| Banco Supabase | Backup automatico Supabase (retencao 7 dias no plano Pro) | Diario (automatico) | Supabase Cloud |
| Schema SQL | Versionado em `scripts/schema.sql` | A cada mudanca | GitHub |
| Codigo | Git (GitHub) | A cada commit | GitHub |
| Env vars | Documentados em CLAUDE.md, valores em Vercel/GitHub | Sob demanda | Vercel + GitHub Secrets |
| candidatos.json | Versionado em `data/candidatos.json` | A cada mudanca | GitHub |

**Recuperacao**: em caso de perda total do banco, restaurar via backup Supabase ou re-executar `scripts/schema.sql` + pipeline completo (`npx tsx scripts/ingest-all.ts`).

---

## Testes de continuidade

| Teste | Quando | Status |
| --- | --- | --- |
| Restaurar banco a partir de backup | Ate 2026-08-01 | Pendente |
| Build e deploy em plataforma alternativa | Ate 2026-08-01 | Pendente |
| Simular falha de Supabase (desconectar env var) | Ate 2026-08-01 | Pendente |
| Validar ISR cache apos queda simulada | Ate 2026-08-01 | Pendente |
| Re-executar pipeline completo do zero | Ate 2026-08-01 | Pendente |

---

## Comunicacao em crise

| Canal | Quando usar | Responsavel |
| --- | --- | --- |
| Instagram/X (redes do Thiago) | Site offline > 1h em periodo eleitoral | Thiago |
| Banner no site | Dados potencialmente desatualizados > 48h | Thiago (via deploy) |
| Email (privacidade@puxaficha.com.br) | Resposta a titulares afetados | Thiago |
