# Comportamento esperado

## Produto e dados

1. A ficha pública é o critério final de entrega.
2. Um dado novo preserva a proveniência e não sobrescreve uma fonte superior
   com uma evidência inferior.
3. Identidade eleitoral é persistida por `SQ_CANDIDATO` confirmado. Nome, data
   de nascimento, cargo e UF podem encaminhar revisão, mas não bastam para
   persistir dados sensíveis ou homônimos.
4. O sistema nunca inventa CPF, candidatura, filiação, patrimônio, processo,
   sanção, posição, notícia ou resultado zero.
5. Falha de transporte não vira `vazio_confirmado`.
6. Ausência de linha não prova ausência de fato.
7. Dados anteriores continuam visíveis quando ajudam a explicar a trajetória,
   mas não podem ser apresentados como declaração atual.
8. Cargos, partidos e datas usam formas canônicas antes de orientar regras de
   aplicabilidade.
9. Toda fonte exibida ao leitor deve abrir, sustentar a afirmação e ser
   específica o bastante para auditoria.
10. Publicação editorial exige decisão explícita por item. Classificar, aplicar
    no banco, abrir PR, fazer deploy e publicar são etapas diferentes.
11. Mudança partidária derivada do TSE usa somente casamento confirmado por CPF
    ou `SQ_CANDIDATO`, ignora trajetória despublicada e nunca altera linha de
    curadoria. Partidos distintos no mesmo ano interrompem a derivação e viram
    revisão nominal.

## Estados visuais obrigatórios

- `publicado`: mostrar o dado e suas fontes.
- `vazio_confirmado`: mostrar que nada foi encontrado, em qual escopo e quando.
- `nao_aplicavel`: mostrar por que a frente não se aplica.
- `nao_coletado`, `indeterminado` ou `erro`: mostrar pendência ou falha sem
  insinuar ficha limpa.
- Conteúdo truncado deve continuar acessível por expansão ou página de detalhe.
- Contadores, títulos, cards-resumo e páginas de detalhe devem concordar.

## Atualização e cache

Qualquer pipeline que persista mudança publicável deve, na mesma execução ou
workflow, invalidar as tags afetadas e comprovar a leitura pública. O término de
um script, uma linha no banco ou um HTML local não bastam.

Não repita um cron ou lote mutável apenas porque a primeira execução pareceu
incompleta. Verifique `execution_id`, cursor, logs e readback antes de autorizar
nova execução.

## Git e ambientes

- `main` é a base integrável e deve refletir o estado superior conhecido.
- Desenvolvimento usa branches `codex/*` quando necessário.
- Não mantenha worktrees persistentes. A pasta canônica local é
  `/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha`.
- Não faça stash, descarte ou sobrescreva mudanças do usuário.
- PR aberto não é merge; merge não é deploy; deploy Ready não prova que a rota
  pública contém o dado esperado.
- Produção só é confirmada com commit/deployment e inspeção direta da rota ou API.
- Migrations são cumulativas. Use allowlist fechada, dry-run, comparação de
  cardinalidade e leitura posterior antes de alterações remotas.

## Segurança e privacidade

- CPF nunca chega ao browser e nunca aparece em logs ou artefatos de revisão.
- Service role e tokens ficam apenas no servidor ou em automações autorizadas.
- Nenhuma credencial entra no Git.
- Jobs em pull requests não recebem segredos de produção.
- Toda mudança em autenticação, cabeçalhos, cron interno ou superfície de dados
  pessoais exige gate de segurança proporcional.
