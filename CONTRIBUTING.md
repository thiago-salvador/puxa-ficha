# Contribuindo com o Puxa Ficha

Obrigado pelo interesse em contribuir. O Puxa Ficha é uma plataforma cívica de
consulta pública sobre candidatos das eleições brasileiras. O objetivo é
informar com neutralidade e fontes rastreáveis, então contribuições que
melhorem precisão, transparência, acessibilidade e cobertura de dados são muito
bem-vindas.

## Antes de começar

1. Leia o [README](README.md) e rode o projeto localmente.
2. Leia o [Código de Conduta](CODE_OF_CONDUCT.md).
3. Para mudanças grandes, abra uma issue antes de investir tempo no código, para
   alinharmos escopo e abordagem.

## Princípios do projeto

- **Neutralidade.** O produto não faz juízo de valor sobre candidatos. Todo dado
  exibido precisa de fonte pública rastreável no código. Nada de números
  hardcoded ou afirmações sem fonte.
- **Fonte pública.** Os dados vêm de APIs e bases oficiais (TSE, Câmara, Senado,
  Portal da Transparência). Não adicione dados de origem não verificável.
- **Privacidade.** CPF e outros identificadores pessoais nunca chegam ao cliente.
  Veja [SECURITY.md](SECURITY.md).

## Fluxo de contribuição

1. Faça um fork e crie uma branch a partir da `main`.
2. Faça suas mudanças com commits claros.
3. Rode os gates locais antes de abrir o PR:

   ```bash
   npm run lint          # ESLint
   npm run typecheck     # tsc --noEmit
   npm test              # testes unitários
   npm run build         # build de produção
   ```

4. Abra o Pull Request descrevendo o quê e o porquê. Preencha o template.
5. O CI roda lint, typecheck, testes e build em PRs de fork, sem depender de
   segredos. Ele precisa passar para o merge.

## Estilo de código

- TypeScript, Next.js (App Router), Tailwind. Siga o padrão do código existente.
- O ESLint e o Prettier definem a formatação. Não brigue com eles.

## Pipeline de dados

Os scripts de ingestão em `scripts/` coletam dados das APIs públicas e
persistem no Supabase. Rodá-los exige uma `SUPABASE_SERVICE_ROLE_KEY` própria e,
para alguns, uma chave do Portal da Transparência. Veja o README para detalhes.
Contribuições no pipeline devem ser idempotentes e não sobrescrever dados de
fonte de maior prioridade.

## Licença das contribuições

Ao contribuir, você concorda que sua contribuição será licenciada sob a
[Apache License 2.0](LICENSE), a mesma do projeto, incluindo a concessão de
patente prevista na seção 3 da licença.
