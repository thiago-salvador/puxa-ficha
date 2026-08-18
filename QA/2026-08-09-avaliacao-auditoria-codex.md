# Avaliação da auditoria do Codex sobre os prompts de lançamento

Fonte auditada: `~/.codex/visualizations/2026/08/09/019fe8e4-.../validacao-prompts-lancamento.md`
(o HTML da porta 8897 foi descartado pelo próprio Codex; a entrega dele é o Markdown).
Veredito do Codex: **BLOQUEAR** os cinco prompts como estão. Avaliação: **concordo**,
com verificação própria das alegações e uma discordância parcial.

## P0s confirmados com prova

1. **Dry-run de sanções não existe (P0-2).** Verificado:
   `scripts/lib/ingest-transparencia-sanctions.ts` tem 5 chamadas de escrita
   (`update`/`insert`/`delete`) e zero menção a dry-run. O prompt da Sessão 2
   pedia um diagnóstico que a ferramenta não sabe fazer. Correção: o dry-run
   fail-closed vira a primeira entrega da Trilha B, e até existir, o coletor não
   pode ser invocado contra Supabase real.

2. **Release distribuído entre chats viola o workflow canônico (P0-3).**
   Verificado: `Settings/CANDIDATE_DATA_COMPLETENESS_WORKFLOW.md` (etapa 6) exige
   "orquestrador raiz" exclusivo e ordem serial: CI verde → aprovação → ledger →
   dry-run → banco → readback → PR → merge → deploy → cache → APIs → páginas →
   cobertura. Ressalva: meus prompts preservavam o R-59 (nenhum chat aplicava sem
   autorização nomeada), então não havia buraco de segurança; havia violação de
   contrato do projeto. Correção: trilhas param em artefato local verificado; uma
   sessão raiz única integra e conduz o release serial.

3. **Critérios que apagam falha honesta (P0-4).** O catch mais valioso. "Zero
   fichas com sanções não verificadas" e "nenhuma ficha com Destaques (0)"
   pressionam a sessão a transformar falha de fonte em conclusão. O contrato
   (`Settings/SOURCES_AND_DATA.md`) diz que `erro` e `indeterminado` não fecham
   cobertura, e o workflow manda interromper a frente após duas falhas iguais sem
   evidência nova. Correção: gate exige zero afirmações falsas, não zero estados
   de erro; cada ficha termina em estado terminal honesto com fonte e data.

4. **Base não congelada + worktrees ausentes (P0-1).** Correto. O checkout tem
   arquivos modificados e não rastreados, incluindo `scripts/audit/recortes.json`,
   que as Trilhas A e B editariam simultaneamente. Correção: commit-base único
   antes de qualquer sessão, worktree por trilha, propriedade exclusiva de
   arquivos, e recortes/allowlists/migrations reservados à lane de integração.

## P1s

- **Diagnóstico virou solução antes da prova.** Correto, e o STATUS.md de hoje é
  a evidência: o selo de frescor parecia dado errado no banco e era conversão de
  exibição. A Trilha A assumia migration; cada item precisa rastrear
  fonte → banco → API → DOM antes de escolher a camada do fix.
- **Os 2 erros já tratados hoje fora do gate final.** Correto: fechamento com 20
  linhas (18 queixas + 2 regressões), não 18.
- **Esforço não itemizado.** Procede como limitação, não como bloqueio: a
  triagem ordena, não fecha cronograma.

## Discordância parcial

- **Email de teste.** O Codex diz que envio "só para mim" viola a regra global.
  O R-59 permite explicitamente "teste só para ele" como alternativa segura; a
  proibição absoluta cobre mensagens em nome do Thiago para terceiros. Na
  prática, tanto faz: render local + screenshot light/dark prova o DoD sem envio
  nenhum, então a versão estrita fica valendo.

## Próximo passo proposto

Reescrever os cinco prompts (v2) incorporando: base congelada, worktrees com
propriedade de arquivos, dry-run fail-closed como pré-requisito da B, trilhas
que param em artefato local, sessão raiz única para o release serial, DoD com
estados terminais honestos, e as 2 regressões no gate final.
