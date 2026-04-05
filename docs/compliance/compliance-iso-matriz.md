# Matriz de Compliance do PuxaFicha

## Objetivo

Registrar quais normas e obrigacoes legais fazem sentido para o PuxaFicha, em que ordem entram e quais nao valem o custo agora.

O foco deste documento e orientar prioridade operacional. Ele nao afirma que o projeto ja possui certificacoes.

## Escopo considerado

Esta matriz considera o escopo real do produto hoje:

- app publico em Next.js
- banco e views no Supabase
- deploy e borda em Vercel
- pipeline de ingestao e auditoria factual
- segredos, tokens e acessos administrativos
- uso de IA para geracao de pontos_atencao (com flag `gerado_por: "ia"` e `verificado: false`)

## Matriz

| Norma / Obrigacao | Status para o PuxaFicha | Prioridade | Milestone | Motivo pratico |
| --- | --- | --- | --- | --- |
| **LGPD (Lei 13.709/2018)** | **Obrigacao legal, nao opcional** | **0** | **Ate 2026-06** | Trata dados pessoais (CPF, email_campanha, foto, nome, patrimonio). Exige base legal, retencao definida, direitos do titular, registro de operacoes e resposta a incidentes. Sancao real da ANPD. |
| ISO/IEC 27001:2022 | Buscar de verdade | 1 | Ate 2026-08 | Base do SGSI. Organiza risco, acessos, incidentes, fornecedores, mudancas, logs e controles minimos de operacao. |
| ISO/IEC 27701:2025 | Buscar junto ou logo apos 27001 | 2 | Ate 2026-09 | Formaliza governanca de privacidade sobre dados pessoais e complementa o SGSI com foco em tratamento, base legal, retencao e exposicao. |
| ISO/IEC 42001:2023 | Avaliar agora, nao depois | 3 | Ate 2026-08 | Ja existe uso de IA em producao: 210+ pontos_atencao gerados por IA com impacto editorial. O gate publico agora bloqueia itens de IA ate revisao humana, mas a governanca continua necessaria. |
| ISO 22301:2019 | BCP basico antes da eleicao | 4 | Ate 2026-09 | Produto e sobre eleicoes, 2026 e ano eleitoral. Precisa de continuidade minima (RTO, RPO, plano de incidente) antes do pico de outubro. |
| ISO/IEC 27017:2015 | Adotar como baseline de controles | 5 | Ate 2026-10 | Ajuda a endurecer controles de cloud e a separar responsabilidade do projeto versus responsabilidade dos provedores. |
| ISO/IEC 27018:2025 | Adotar como baseline de privacidade em cloud | 6 | Ate 2026-10 | Complementa a camada de privacidade para dados pessoais tratados em cloud publica. |
| ISO 9001 | Nao priorizar agora | Baixa | - | E gestao de qualidade generica. Nao ataca o risco principal do produto neste momento. |
| ISO/IEC 20000-1 | Nao priorizar agora | Baixa | - | So passa a fazer sentido com operacao formal de servicos de TI e exigencia contratual mais pesada. |

## Leitura objetiva

### Obrigatorio

- **LGPD**: nao e ISO, nao e opcional. E a linha zero.

### Agora

- ISO/IEC 27001:2022
- ISO/IEC 27701:2025
- ISO/IEC 42001:2023 (IA ja esta em producao com saida editorial)

### Antes da eleicao (outubro 2026)

- ISO 22301:2019 (BCP minimo)
- ISO/IEC 27017:2015
- ISO/IEC 27018:2025

### Nao vale o custo agora

- ISO 9001
- ISO/IEC 20000-1

## Gap analysis (alto nivel)

Mapa do que existe vs o que falta para as prioridades 0-4.

### LGPD

| Controle | Status | O que falta |
| --- | --- | --- |
| Base legal definida por operacao | Feito | Mapeado em `docs/lgpd-ropa.md` (13 tabelas, 3 bases legais) |
| Registro de operacoes de tratamento (ROPA) | Feito | `docs/lgpd-ropa.md` |
| Politica de privacidade publica | Feito | `src/app/privacidade/page.tsx` (rota /privacidade, 11 secoes) |
| Direitos do titular (acesso, correcao, exclusao) | Feito (doc) | Canal definido: privacidade@puxaficha.com.br. Procedimento em `docs/lgpd-incident-playbook.md`. Pendente: criar o email |
| Retencao e descarte | Parcial | Regras formalizadas no ROPA. CPF permanente (dado publico). Noticias > 12 meses: automacao pendente |
| Resposta a incidentes (72h ANPD) | Feito | `docs/lgpd-incident-playbook.md` (4 severidades, 5 fases, contatos de emergencia) |
| DPO / Encarregado | Nao designado | Designar responsavel. Email definido mas ainda nao criado |

### ISO/IEC 27001:2022 (SGSI)

| Controle | Status | O que falta |
| --- | --- | --- |
| Inventario de ativos | Feito | `docs/risk-register.md` (5 ativos, 8 secrets, 4 provedores) |
| Controle de acesso | Parcial | Supabase RLS ativo, anon audit feito. Falta politica formal de acessos administrativos |
| Gestao de segredos | Feito | Secrets documentados em `docs/risk-register.md`. Script de rotacao em `scripts/rotate-secrets.sh` |
| Logs e monitoramento | Parcial | Vercel logs existem. Falta alerting e retencao formal |
| Gestao de mudancas | Parcial | PRs e CI existem. Falta politica formal de change management |
| Gestao de incidentes | Feito | `docs/lgpd-incident-playbook.md` (compartilhado com LGPD) |
| Analise de riscos | Feito | `docs/risk-register.md` (7 riscos com probabilidade, impacto, controles, acoes) |
| Auditoria interna | Parcial | Audit factual existe. Falta auditoria de seguranca periodica |

### ISO/IEC 42001:2023 (IA)

| Controle | Status | O que falta |
| --- | --- | --- |
| Inventario de sistemas de IA | Feito | Documentado em `docs/ia-governance.md` secao 1. 1 sistema editorial mapeado no repo atual |
| Classificacao de risco | Feito | Alto (acusacoes), medio (perfis, feitos positivos). Documentado em `docs/ia-governance.md` secao 2 |
| Transparencia | Parcial | Badge na ficha individual. Falta cobertura no comparador e outras superficies |
| Revisao humana | Parcial | Gate ativo. Fila de revisao criada (`docs/revisao-pontos-ia.md`, 150 pontos). Execucao manual pendente |
| Politica de uso de IA | Feito | Documentada em `docs/ia-governance.md` secao 3. Usos permitidos, proibidos, atribuicao |

### ISO 22301:2019 (Continuidade)

| Controle | Status | O que falta |
| --- | --- | --- |
| BIA (analise de impacto no negocio) | Feito | 4 servicos criticos mapeados em `docs/bcp-continuidade.md` |
| RTO / RPO definidos | Feito | Definidos por servico em `docs/bcp-continuidade.md` (site 4h, banco 8h, pipeline 48h) |
| Plano de continuidade | Feito | `docs/bcp-continuidade.md` (6 cenarios com resposta) |
| Testes de continuidade | Pendente | 5 testes agendados para ate agosto 2026 |

## Por que isso vale para este projeto

O projeto trata dados pessoais. O schema atual inclui `cpf` e `email_campanha` em [`scripts/schema.sql`](../scripts/schema.sql).

Tambem ja houve necessidade concreta de hardening da superficie publica. A auditoria em [`docs/2026-04-01-supabase-anon-audit.md`](./2026-04-01-supabase-anon-audit.md) registrou o fechamento de exposicao anonima de `cpf`, `cpf_hash`, `email_campanha` e `wikidata_id`.

Alem disso, ja existe uso de IA em producao: 210+ pontos_atencao gerados por modelo de linguagem. O gate publico passou a bloquear itens com `gerado_por = "ia"` enquanto `verificado = false`, mas a esteira de revisao humana, transparencia e governanca continua relevante.

Isso muda a priorizacao. Para o PuxaFicha, o eixo principal nao e qualidade generica de processo. E:

1. **LGPD**: obrigacao legal sobre dados pessoais, com sancao real
2. **Seguranca da informacao**: controle de acesso, exposicao publica, gestao de segredos
3. **Governanca de IA**: transparencia e revisao humana sobre saidas editoriais
4. **Continuidade**: disponibilidade em periodo eleitoral critico
5. **Responsabilidade compartilhada**: separacao clara do que e do projeto vs provedores

## Ordem recomendada

1. **LGPD primeiro.** Mapear operacoes de tratamento, publicar politica de privacidade, definir canal de direitos do titular, designar encarregado. Ate junho 2026.
2. **ISO/IEC 27001:2022** para o escopo atual do produto. Ate agosto 2026.
3. **ISO/IEC 42001:2023** em paralelo com 27001, dado que IA ja esta em uso. Ate agosto 2026.
4. **ISO/IEC 27701:2025** acoplada ao SGSI para formalizar privacidade. Ate setembro 2026.
5. **ISO 22301:2019** BCP basico antes do pico eleitoral de outubro.
6. **ISO/IEC 27017:2015 e 27018:2025** como baseline tecnica para Vercel, Supabase, segredos, logs, retencao e terceiros.
7. Reavaliar ISO 9001 e 20000-1 apenas se houver exigencia contratual.

## Limites e observacoes

- ISO e opcional. LGPD nao e.
- Certificacao de provedor ajuda, mas nao transfere a responsabilidade do projeto.
- O compliance relevante aqui nao e "do repo". E do escopo operacional inteiro: app, banco, pipelines, secrets, acessos, deploy, incidentes e terceiros.
- Vercel e outros fornecedores entram no desenho de controles, mas o projeto continua responsavel por configuracao, integracoes, exposicao de dados, retencao, resposta a incidente e governanca interna.
- Os milestones sao metas de trabalho, nao datas de certificacao. Certificacao formal tem ciclo proprio.

## Referencias uteis

- Vercel Security & Compliance: <https://vercel.com/docs/security/compliance>
- Vercel Shared Responsibility Model: <https://vercel.com/docs/security/shared-responsibility>
- Guia da ANPD sobre seguranca da informacao para agentes de tratamento de pequeno porte: <https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte>
- LGPD (Lei 13.709/2018): <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>
- ANPD - Modelo de registro simplificado de operacoes: <https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes>
