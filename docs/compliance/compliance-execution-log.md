# Compliance Execution Log

Registro de execucao da matriz de compliance (`docs/compliance/compliance-iso-matriz.md`).
Cada lote e logado aqui com data, o que foi feito e arquivos criados/modificados.

---

## Lote 1: LGPD - ROPA + Politica de Privacidade (2026-04-03)

### 1.1 ROPA criado

Arquivo: `docs/compliance/lgpd-ropa.md`

Registro de operacoes de tratamento cobrindo todas as 14 tabelas do schema.
Mapeia: operacao, dados pessoais, base legal, finalidade, retencao, compartilhamento.

### 1.2 Politica de privacidade

Arquivo: `src/app/privacidade/page.tsx`

Pagina publica em /privacidade com:
- Controlador e contato
- Dados tratados e finalidade
- Base legal
- Compartilhamento
- Retencao
- Direitos do titular
- Seguranca
- Cookies
- Atualizacoes

---

## Lote 2: LGPD - Playbook de Incidentes + Direitos do Titular (2026-04-03)

### 2.1 Playbook de incidentes

Arquivo: `docs/compliance/lgpd-incident-playbook.md`

Cobre: definicao, severidade (4 niveis), procedimento em 5 fases (deteccao, contencao, notificacao ANPD 72h, remediacao, pos-incidente), contatos de emergencia.

### 2.2 Canal de direitos do titular

Integrado no mesmo arquivo. Define:
- Email: privacidade@puxaficha.com.br
- Procedimento de 8 passos para solicitacoes
- Prazo: 15 dias uteis
- Limitacoes ao direito de exclusao (interesse publico)
- Registro em `docs/titular-requests/`

---

## Lote 3: ISO 42001 - Transparencia de IA no frontend (2026-04-03)

### 3.1 Badge "Gerado por IA" nos pontos de atencao

Arquivo modificado: `src/components/CandidatoProfile.tsx`

- Adicionado badge violeta "Gerado por IA" com icone Bot (lucide) em ambos os blocos: alertas/pontos negativos e pontos positivos
- Condicao: `p.gerado_por === "ia"`
- Aparece ao lado dos badges existentes (gravidade, categoria, verificado)
- Type check: zero erros

### 3.2 Secao de IA na politica de privacidade

Ja incluida no lote 1 (secao 07 de /privacidade).

---

## Lote 4: ISO 27001 - Registro de Riscos e Inventario de Ativos (2026-04-03)

### 4.1 Registro de riscos

Arquivo: `docs/compliance/risk-register.md`

- Inventario de ativos: 5 ativos de aplicacao, 8 secrets/tokens, 4 provedores
- 7 riscos identificados (R01-R07) com probabilidade, impacto, controles e acoes
- Riscos criticos: exposicao de CPF (mitigado), vazamento de service role key, IA incorreta, indisponibilidade eleitoral

---

## Lote 5: ISO 22301 - BCP Basico Pre-Eleicao (2026-04-03)

### 5.1 Plano de continuidade

Arquivo: `docs/compliance/bcp-continuidade.md`

- 4 servicos criticos mapeados com RTO/RPO
- 6 cenarios de crise com resposta (Vercel down, Supabase down, pipeline quebra, DDoS, credenciais, dados incorretos)
- Backup e recuperacao documentados
- 5 testes de continuidade agendados para ate agosto 2026
- Comunicacao em crise definida

---

## Lote 6: ISO 42001 + hardening de publicacao para IA nao verificada (2026-04-03)

### 6.1 Gate publico para `pontos_atencao` de IA

Arquivos:
- `supabase/migrations/20260403234500_gate_unverified_ai_attention_points.sql`
- `scripts/schema.sql`
- `src/lib/api.ts`
- `src/lib/types.ts`

Feito:
- Criada a funcao SQL `is_public_attention_point(is_visible, generated_by, is_verified)`
- Endurecida a policy publica de `pontos_atencao`
- Atualizadas as views `v_ficha_candidato` e `v_comparador` para excluir itens com `gerado_por = "ia"` enquanto `verificado = false`
- Adicionada segunda camada de filtro no app publico em `src/lib/api.ts`
- Mantido preview interno com `service_role` sem esse bloqueio adicional no app

### 6.2 Alinhamento da comunicacao e das regras

Arquivos:
- `AGENTS.md`
- `src/app/sobre/page.tsx`
- `src/app/privacidade/page.tsx`
- `docs/compliance/compliance-iso-matriz.md`
- `docs/compliance/risk-register.md`
- `docs/fluxo-funcionamento-site.md`
- `docs/compliance/lgpd-ropa.md`

Feito:
- Regra do projeto passou a proibir explicitamente publicacao de `pontos_atencao` de IA nao verificada
- Paginas publicas deixaram explicito que itens de IA so entram na superficie publica apos revisao humana
- Docs operacionais foram atualizados para refletir que o gap de gate publico foi fechado, mas o workflow editorial completo continua aberto

### 6.3 Validacao

- `npm run check:scripts`
- `npm run lint`
- `npm run build`

Resultado:
- todos passaram

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

---

## Lote 7: Pendencias operacionais (2026-04-03)

### 7.1 Fila de revisao de pontos de IA

Arquivo: `docs/compliance/revisao-pontos-ia.md`

- 150 pontos pendentes (8 criticos, 9 altos, 6 medios, 127 baixos)
- Categorias: 68 feitos positivos, 56 perfis, 8 escandalos, 7 patrimonio incompativel, etc.
- Instrucoes de revisao com SQL helpers para aprovacao/rejeicao individual e em lote

### 7.2 Script de rotacao de secrets

Arquivo: `scripts/rotate-secrets.sh`

- Rotaciona PF_PREVIEW_TOKEN automaticamente (uuidgen + Vercel CLI)
- Lista secrets manuais com instrucoes passo a passo
- Registra rotacoes em `docs/secret-rotation-log.md` quando houver execucao real do script
- Suporta --dry-run

### 7.3 Decisao sobre CPF

CPF de candidatos e dado publico por lei eleitoral (Lei 9.504/97). Nao requer descarte pos-eleicao.
Atualizado em `docs/compliance/lgpd-ropa.md` (retencao e pendencias).

### 7.4 Governanca de IA (classificacao de risco + politica de uso)

Arquivo: `docs/compliance/ia-governance.md`

- Inventario de 1 sistema editorial de IA comprovado no repo atual
- Classificacao de risco: alto (acusacoes), medio (feitos positivos e saidas editoriais menos sensiveis)
- Politica de uso: 4 usos permitidos, 6 usos proibidos, regras de atribuicao
- Controles tecnicos mapeados (7 controles ativos)
- Processo de revisao documentado
- Metricas de monitoramento definidas

---

## Resumo da sessao (2026-04-03)

### Arquivos criados
- `docs/compliance/compliance-iso-matriz.md` (atualizado com LGPD, milestones, gap analysis)
- `docs/compliance/compliance-execution-log.md` (este arquivo)
- `docs/compliance/lgpd-ropa.md` (ROPA completo, 13 tabelas mapeadas)
- `docs/compliance/lgpd-incident-playbook.md` (playbook de incidentes + canal de direitos)
- `docs/compliance/risk-register.md` (7 riscos, inventario de ativos e secrets)
- `docs/compliance/bcp-continuidade.md` (BCP pre-eleicao)
- `src/app/privacidade/page.tsx` (politica de privacidade publica)

### Arquivos modificados
- `src/components/CandidatoProfile.tsx` (badge "Gerado por IA" nos pontos de atencao)

### Gaps pendentes (atualizados apos lote 7)
- Designar DPO / encarregado
- Criar email privacidade@puxaficha.com.br
- Completar revisao humana dos pontos de IA. Fila criada em `docs/compliance/revisao-pontos-ia.md` (150 pontos). Execucao continua manual.
- Avaliar se email_campanha deve ser exposto publicamente
- ~~Implementar automacao de descarte de CPF~~ → decisao: CPF e dado publico, sem descarte. Noticias > 12 meses pendente de automacao.
- Operacionalizar rotacao de secrets a cada 90 dias. Script criado em `scripts/rotate-secrets.sh`, mas a primeira execucao e o log formal ainda estao pendentes.
- Executar os 5 testes de continuidade ate agosto
- Ativar mock fallback em producao como medida de contingencia
- Adicionar badge de IA na pagina de comparacao tambem
- ~~Classificacao de risco de IA~~ → formalizada em `docs/compliance/ia-governance.md`
- ~~Politica de uso de IA~~ → criada em `docs/compliance/ia-governance.md`
