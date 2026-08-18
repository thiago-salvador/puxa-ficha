# QA: destaques legislativos

## Resumo

Foi criado um tratamento visual para os cards exibidos na aba **Destaques** da legislação do Executivo.

## O que mudou

- Adicionada uma faixa lateral escura nos cards destacados.
- Aplicado um fundo tonalizado e uma sombra discreta para separar o recorte editorial da lista comum.
- Adicionado o selo `Destaque editorial` em cada ato exibido no recorte.
- O tratamento é ativado apenas quando a lista representa destaques; o inventário completo permanece neutro.
- Nenhuma seleção, regra de relevância, fonte ou dado legislativo foi alterado.

Arquivo principal:

- `src/components/CandidatoProfileSections.tsx`

## Verificação

- `npm run typecheck` com Node 24.15.0: passou.
- ESLint focado no componente: passou.
- Suíte de testes: 2.121 testes passaram, 0 falhas.
- `git diff --check`: passou.
- Ficha pública local do Lula verificada no Playwright, com a aba de legislação aberta e os destaques renderizados.
- A rota local `http://localhost:3000/candidato/lula?tab=legislacao` foi aberta diretamente; a aba `Destaques` apareceu selecionada e os dois cards exibiram o selo `Destaque editorial`.
- Captura visual: `output/playwright/legislacao-destaques-prototipo-full.png`.

## Limites do teste

- A validação foi local; não houve deploy nem verificação em produção.
- O servidor local exibiu um aviso de carregamento degradado do inventário completo, mas os dois destaques disponíveis foram renderizados e inspecionados.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
