# Integridade sistêmica das candidaturas públicas de 2026

## Objetivo

Reconciliar toda a superfície pública de Presidente e Governador com o estado atual do DivulgaCand, corrigir substituições e candidaturas terminadas, completar os perfis afetados pela atualização oficial e impedir que uma nova ficha vazia seja publicada.

## Restrições

- Trabalhar somente na branch isolada `codex/candidate-roster-integrity`.
- Não aplicar migration no banco remoto, não fazer push e não fazer deploy sem confirmação explícita.
- A ausência ou falha do TSE nunca autoriza remoção, substituição ou publicação.
- Preservar dados curados existentes. Backfill oficial só preenche campos vazios ou corrige um vínculo oficial comprovadamente errado.
- Não publicar uma combinação ambígua de titular e vice.

## Contratos de aceitação

1. O header conta apenas titulares públicos, nunca vices.
2. Todo titular público tem candidatura oficial atual e não terminal no DivulgaCand.
3. Candidatura com Renúncia, Falecimento, Cancelamento ou registro definitivamente inapto não permanece pública.
4. Substituição comprovada remove o titular anterior e publica o novo apenas quando a ficha nova está pronta.
5. Titular e vice nunca podem compartilhar o mesmo SQ de candidatura ou o mesmo perfil.
6. Todo perfil novo precisa, antes de `publicavel = true`, de foto oficial, biografia factual, naturalidade, data de nascimento, escolaridade, ocupação declarada, gênero, estado civil, raça/cor, partido, situação atual e proveniência estruturada.
7. A auditoria recorrente compara a fonte oficial com `candidatos_publico`, não apenas com `chapas_2026`.
8. Falha de rede, resposta vazia inesperada ou ambiguidade produz `review_required` e zero escrita.

## Plano de implementação

### Lote 1: inventário e contratos falhando

1. Congelar fixtures sanitizadas do DivulgaCand para candidaturas ativas, renúncias, substituições, recursos e combinações ambíguas.
2. Criar testes puros para classificação de situação, reconciliação da superfície, substituição titular/vice e admissão de perfil.
3. Produzir inventário read-only de todos os titulares oficiais versus todos os perfis públicos e de todos os campos mínimos ausentes.

### Lote 2: implementação sistêmica

4. Criar coletor read-only do DivulgaCand com timeout, retry limitado, validação de universo e saída sanitizada.
5. Criar biblioteca única de reconciliação e completude usada pelo CLI, cron e testes.
6. Corrigir o gerador de chapas para nunca promover `novo_perfil_oficial` dentro de `duplicidade_oficial` sem resolução vigente.
7. Atualizar a auditoria de freshness para consultar também a superfície pública e emitir diferenças de publicação e completude.

### Lote 3: dados e provas

8. Gerar migration e rollback com precondições, despublicando todos os perfis comprovadamente terminados e preenchendo apenas lacunas oficiais.
9. Corrigir Well Macedo, Rico Pinheiro e qualquer outro perfil que falhe no novo contrato, com proveniência por campo.
10. Rodar testes focados, suíte de freshness, lint, typecheck, build, replay PostgreSQL e verificação visual local.

## Critério de parada

O trabalho local termina somente quando os inventários de candidatura pública divergente, vice inválida e perfil abaixo do contrato estiverem zerados no snapshot pós-migration, ou quando um caso permanecer explicitamente em quarentena por ambiguidade oficial documentada.
