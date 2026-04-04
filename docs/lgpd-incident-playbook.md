# Playbook de Resposta a Incidentes de Seguranca

Procedimento para incidentes que envolvam dados pessoais, conforme LGPD (Art. 48) e boas praticas de 27001.

**Responsavel**: Thiago Salvador
**Canal de notificacao**: privacidade@puxaficha.com.br
**Data de elaboracao**: 2026-04-03

---

## Definicao de incidente

Qualquer evento que resulte em:
- Acesso nao autorizado a dados pessoais (CPF, email_campanha, dados do banco)
- Exposicao publica de dados que deveriam ser restritos (falha de RLS, leak de env vars)
- Perda ou corrupcao de dados pessoais
- Uso indevido de dados por terceiro (scraping massivo, exfiltracao)

---

## Severidade

| Nivel | Descricao | Exemplo | Prazo de acao |
| --- | --- | --- | --- |
| Critica | Dado pessoal sensivel exposto publicamente | CPF visivel no frontend, env var vazada | Imediato (< 1h) |
| Alta | Acesso nao autorizado confirmado | Quebra de RLS, token comprometido | < 4h |
| Media | Potencial exposicao sem confirmacao | Log suspeito, tentativa de acesso | < 24h |
| Baixa | Vulnerabilidade identificada sem exploracao | Configuracao errada sem impacto | < 72h |

---

## Procedimento

### 1. Deteccao e triagem (0-1h)

- [ ] Identificar o que aconteceu e qual dado foi afetado
- [ ] Classificar severidade (tabela acima)
- [ ] Registrar em `docs/incidents/YYYY-MM-DD-descricao.md`
- [ ] Se critico: ir direto para contencao

### 2. Contencao (1-4h)

- [ ] **RLS quebrado**: revogar acesso anon/authenticated na tabela afetada via Supabase dashboard
- [ ] **Env var vazada**: rotacionar o secret imediatamente (Supabase, Vercel, GitHub)
- [ ] **Token comprometido**: revogar e regenerar token
- [ ] **Dados expostos no frontend**: deploy de hotfix removendo o dado, ou rollback via Vercel
- [ ] Confirmar que a contencao funcionou (testar acesso publico)

### 3. Notificacao (ate 72h para ANPD)

Se o incidente envolver risco ou dano relevante aos titulares:

- [ ] Notificar a ANPD em ate 2 dias uteis (Art. 48, LGPD) via formulario em anpd.gov.br
- [ ] Conteudo da notificacao:
  - Descricao da natureza dos dados afetados
  - Informacoes sobre os titulares envolvidos
  - Medidas tecnicas e de seguranca utilizadas
  - Riscos relacionados ao incidente
  - Medidas adotadas para reverter ou mitigar
  - Motivos da demora (se aplicavel)
- [ ] Se dados de candidatos foram afetados: avaliar se ha necessidade de comunicacao direta ao titular

### 4. Remediacao

- [ ] Corrigir a causa raiz (patch, configuracao, RLS)
- [ ] Verificar se outros dados foram afetados (busca lateral)
- [ ] Atualizar controles de seguranca
- [ ] Documentar a correcao no registro do incidente

### 5. Pos-incidente

- [ ] Escrever post-mortem em `docs/incidents/`
- [ ] Atualizar este playbook se o procedimento foi insuficiente
- [ ] Atualizar o registro de riscos (`docs/risk-register.md`) se aplicavel
- [ ] Comunicar ao titular se houve impacto direto

---

## Contatos de emergencia

| Servico | Canal | Acao |
| --- | --- | --- |
| Supabase | Dashboard + suporte | Revogar acesso, pausar projeto |
| Vercel | Dashboard + CLI | Rollback de deploy, rotacionar env vars |
| GitHub | Settings > Secrets | Rotacionar tokens |
| ANPD | anpd.gov.br/incidentes | Notificacao formal |

---

## Canal de direitos do titular

Candidatos podem solicitar acesso, correcao ou informacoes sobre seus dados pessoais via:

**Email**: privacidade@puxaficha.com.br

### Procedimento para solicitacoes

1. Receber solicitacao e confirmar recebimento em ate 2 dias uteis
2. Verificar identidade do solicitante (confirmar que e o candidato ou representante legal)
3. Localizar dados do titular no banco (busca por slug ou nome)
4. Responder com:
   - Confirmacao da existencia de tratamento
   - Quais dados sao tratados
   - Fontes dos dados
   - Base legal
   - Com quem sao compartilhados
5. Se pedido de correcao: verificar na fonte original (TSE, Camara, Senado) e corrigir se procedente
6. Se pedido de exclusao: avaliar se base legal permite (interesse publico pode limitar exclusao)
7. Prazo maximo de resposta: 15 dias uteis (Art. 18, LGPD)
8. Registrar solicitacao e resposta em `docs/titular-requests/`

### Limitacoes ao direito de exclusao

Dados de candidatos a cargos eletivos tratados para fins de interesse publico e transparencia podem ter o direito de exclusao limitado, conforme Art. 16, III da LGPD. Nestes casos, informar ao titular a base legal que justifica a manutencao do tratamento.
