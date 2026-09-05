# Stack e versões

Snapshot verificado em 06/08/2026. `package.json` e `package-lock.json` são a
autoridade para pacotes. Este arquivo registra a combinação suportada e os
desvios operacionais relevantes.

| Camada | Versão ou escolha |
|---|---|
| Runtime | Node.js 24.x; gates locais verificados com 24.14.0 |
| Gerenciador | npm 10.9.8; lockfile v3; instalação com `npm ci` |
| Framework | Next.js 16.2.12, App Router e Turbopack |
| UI | React 19.2.8, React DOM 19.2.8, Tailwind CSS 4.3.3, shadcn |
| Linguagem | TypeScript 6.0.3 |
| Banco | Supabase/PostgreSQL; `@supabase/supabase-js` 2.111.0 |
| Observabilidade | `@sentry/nextjs` 10.69.0 e Cloudflare Web Analytics |
| Testes | Node test runner, tsx 4.23.1, Playwright 1.62.1, axe |
| Qualidade | ESLint 9.39.5, cspell, knip e c8 |
| Deploy | Vercel, região `gru1` |
| Repositório | GitHub, `thiago-salvador/puxa-ficha` |

## Regras de runtime

- Execute `nvm use`, `fnm use` ou o Node 24 configurado no workspace antes dos
  gates. O Node padrão do shell foi encontrado em 22.23.1 e não é suportado.
- Não troque npm por outro gerenciador sem decisão explícita e migração do
  lockfile.
- Não atualize dependências junto com uma correção de dados sem necessidade.
- O Supabase CLI local estava em 2.98.2, com 2.111.0 disponível. Isso é drift de
  ferramenta, não autorização para atualizar.

## Gates básicos

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run settings:check
```

Testes visuais e de acessibilidade exigem browsers do Playwright. Mudanças na
ficha pública, responsividade ou estados visuais devem executar o recorte
Playwright correspondente, além dos gates básicos.

## Revisão de dependências e lint de 05/09/2026

O lockfile atualiza a dependência transitiva de desenvolvimento `qs` de 6.15.2
para 6.16.0 dentro do intervalo já declarado, corrigindo os advisories moderados.
Não altera a API de dependências diretas. O ESLint passa a verificar promises
com tipos em todo `src/`: `no-floating-promises` e `no-misused-promises` são
erros bloqueantes. Scripts mantêm o gate TypeScript próprio.
