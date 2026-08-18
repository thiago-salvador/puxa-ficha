# P-LOWS-FINAIS, relatório de execução

Data: 2026-08-15 16:16 BRT  
Branch: `fix/master-review-lows`  
Base: `origin/main` em `bd8ccc0`  
Commits do lote: `96d2fd8`, `3fe1cdb`, `4241d8d`, `98aa4cc`
Banco remoto: não acessado para escrita  
Push: não realizado

## Resultado item a item

| Item | Status | Prova de uma linha |
| --- | --- | --- |
| 1. Sentry lazy-load | PARCIAL | O chunk principal do SDK ficou em 112.971 B brotli antes e depois, delta 0 B. `excludeTracing` reduziu só 84 B no conjunto detectado, de 138.010 B para 137.926 B, e foi revertido. O Sentry documenta que essa tree-shaking não opera com Turbopack. Dono: integração Sentry com Turbopack. |
| 2. Origem do send-digest | DONE | `send-digest` usa `validarOrigemEncadeamento`, rejeita origem inválida e degrada o lote sem expor o segredo; suíte de alertas verde. |
| 3. RFC 8058 | DONE | Digest envia `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, a URL canônica aceita POST sem JSON e o contrato HTTP passou. |
| 4. UF da OG do quiz | DONE | A rota resolve `uf` com `resolveEstadoUf` antes de compor a imagem; contrato estático verde. |
| 5. Metadata da 404 | DONE | `not-found.tsx` exporta metadata e o browser confirmou status 404 e título `Página não encontrada | Puxa Ficha`. |
| 6. Busca global no iOS | DONE | Browser em viewport de 393 px mediu `font-size: 16px` no campo da busca rápida; desktop mantém 14 px a partir de `md`. |
| 7. `batch_failed` | DONE | O logger padrão do `news/refresh` seleciona `console.error` somente para `batch_failed`; contrato estático verde. |
| 8. Migration de higiene | DONE | Uma única migration, `20260815190000`, fixa 2 `search_path` e cria 2 índices. Schema replay: 79 aplicadas, 0 falhas, hash `457537c1d3874a0a43a2cef0a038d059fe5bb3e635a7a0292cf57bfc5ceaeb32`. Replay linear: 306 + 103 = 409. Prova comportamental: `functions=2`, `indexes=2`. |
| 9. Redirect de alertas | DONE | Redirect estático permanente adicionado e o browser terminou em `/alertas/gerenciar`. |
| 10. Título do comparador | DONE | `generateMetadata` resolve todos os slugs por `getCandidatoMetadataResource` e usa `nome_urna`, com fallback honesto para slug; contrato estático verde. |
| 11. Fallback de foto | DONE | `CandidatePhoto` rejeita `ui-avatars.com` e renderiza iniciais locais; o enrich parou de gravar placeholders e nenhuma foto real foi alterada. Testes do helper verdes. |
| 12. Short-link no runtime-smoke | DONE | O smoke cria por POST, prova a resolução 307, apaga o token no `finally` e falha fechado se a limpeza não remover exatamente uma linha; 4 testes da rota verdes. |
| 13. Retenção operacional | PARCIAL | `scripts/retencao-operacional.ts` é dry-run por padrão, exige `--apply`, usa escrita auditada e cobre `quiz_result_short_links.expires_at < now`; 3 testes verdes. As demais tabelas e janelas não constavam no achado fonte. Dono: especificação do master review. |
| 14. Readback Fase 4 | DONE | A aprovação nomeada foi confirmada no Daily Note de 15/08, 15:11. O workflow foi removido e `docs/cobertura-de-dados.md` registra a absorção pelo QA de três camadas e readback por estado da Onda G. |
| 15. ESLint 10 e TypeScript 7 | PARCIAL | Tentativa com ESLint 10.8.1 e TypeScript 7.0.2 revertida, sem commit. Bloqueios: peers do `eslint-config-next` ainda limitados ao ESLint 9, `typescript-eslint` recusa TS 7, TS 7 removeu `baseUrl` e mudou a API importada em `api-cache-wave.test.ts`. |

## Gates finais

| Gate | Resultado |
| --- | --- |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx tsc --project tsconfig.scripts.json` | PASS |
| `npm run check:dead-code` | PASS, somente a hint preexistente de CSS do Knip |
| `npm test` | PASS, 3.186 testes, 0 falhas |
| `npm run build` | PASS, Next.js 16.2.12 com Turbopack |
| `scripts/audit/replay-migrations.sh --schema-gate` | PASS |
| `scripts/audit/replay-migrations.sh --gate` | PASS |

## Evidência visual local

- `output/playwright/404-mobile.png`
- `output/playwright/global-search-mobile.png`

Os arquivos são artefatos locais ignorados pelo Git e não entram nos commits de código.

## Concorrência detectada

Às 16:16 BRT surgiu no mesmo worktree o commit externo `6660ffd`, também publicado em
`origin/fix/master-review-lows`, acrescentando um `GRANT` não solicitado à migration.
Esta execução não criou nem enviou esse commit. O commit local `98aa4cc` neutralizou
somente as 13 linhas fora do escopo; os dois replays foram repetidos e permaneceram verdes.
