# Decisões de dependências

Este arquivo registra as decisões de dependência que não são óbvias pelo
`package.json`, para que fiquem revisáveis em code review e tenham um gatilho
claro de revisão. Travas de versão do Dependabot ficam documentadas em
comentário no próprio `.github/dependabot.yml`.

## Override do `sharp` em `^0.35.3`

O `package.json` declara em `overrides`:

```json
"sharp": "^0.35.3"
```

**Por que existe.** O `sharp` não é dependência direta do projeto: ele entra pelo
Next.js, que o declara em `optionalDependencies`, e é o que otimiza as imagens do
`next/image` (fotos de candidatos, logos de partido, heros) para webp. O override
entrou no commit `2733d5a` (23/07/2026), junto com a subida do Next, para zerar os
alertas de severidade high do `npm audit`. O CI trata isso como gate: o job
`verify` roda `npm audit --omit=dev --audit-level=high`, então um alerta high na
árvore de produção deixa a `main` vermelha.

**Qual é o risco.** A versão forçada está fora da faixa que o Next declara
suportar. Hoje o `next@16.2.12` pede `sharp: ^0.34.5` e o override sobe para
`0.35.3`. Ou seja, a combinação em produção não é a que o Next testa, e uma
mudança de comportamento entre 0.34 e 0.35 apareceria aqui antes de aparecer
upstream.

**Por que seguimos assim.** A combinação foi verificada na prática: o `sharp`
0.35.3 carrega, expõe a libvips 8.18.3 e renderiza normalmente, o `npm audit` de
produção fica em zero vulnerabilidade e o build passa. Entre um alerta high
aberto na árvore de produção e uma versão um minor à frente do range declarado, o
projeto escolhe a segunda.

**Gatilho de realinhamento.** Quando o Next passar a declarar `sharp` em `0.35.x`
(conferir em `node_modules/next/package.json`, campo `optionalDependencies`),
remover a linha do `overrides` ou realinhá-la ao range do Next e confirmar que o
`npm audit --omit=dev --audit-level=high` continua limpo. A verificação vale a
cada subida maior do Next, já que o override deixa de ser necessário no momento em
que o upstream alcança a versão.
