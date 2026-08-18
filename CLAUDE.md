# Puxa Ficha

Leia [Settings/README.md](Settings/README.md) antes de trabalhar neste projeto.
Esse diretório contém objetivo, arquitetura, dados, fontes, workflows,
automações, ambientes, versões, comportamento esperado e status atual.

Não crie uma segunda camada de regras. Atualize `Settings/` quando o contrato do
projeto mudar.

## Claude Code

O que segue não duplica `Settings/`: são as quatro coisas que os gates cobram e
que aquele diretório não documenta.

**Rodar um teste só.** A suíte usa o runner nativo do Node com `tsx`, não jest
nem vitest:

```bash
node --import tsx --test tests/party-switches.test.ts
```

Filtrar dentro do arquivo: acrescente `--test-name-pattern="<regex>"`.

**`npm run check:dead-code` é gate de CI e reprova com uma issue só.** É `knip`
com `--max-issues 0`. Export que ficou sem consumidor derruba o PR, então
remover código morto faz parte da mudança, não de uma limpeza futura.

**Migration de dados exige a anotação `-- @write`.** Todo `INSERT`, `UPDATE` ou
`DELETE` leva `-- @write` na linha acima. Statement sem anotação é escrita
invisível para o gate e reprova.

`npm run audit:cobertura:allowlist`, **sem flag nenhuma**, é o gate: ele lê
`scripts/audit/recortes.json` e confere cada recorte na própria janela contra a
própria allowlist. Não rode uma allowlist contra a árvore inteira, é isso que
produzia 550 violações sem significado.

Migration de dados nova exige **três** coisas no mesmo PR: as anotações `@write`,
uma allowlist que autorize os pares `(tabela, slug, campos)`, e uma entrada em
`recortes.json` ligando a janela àquela allowlist. Falta qualquer uma e o comando
reprova. Para conferir um recorte antes de registrá-lo, use
`--allowlist=... --desde=... --ate=...`; as três são obrigatórias juntas, e a
janela é comparação de prefixo do nome do arquivo, não data.

As escritas anteriores à convenção estão congeladas por arquivo em
`scripts/audit/baseline-escritas-sem-anotacao.json`, com `sha256`. O baseline só
encolhe: nunca o regenere em massa, porque regenerar absolve dívida nova junto
com a antiga.

**`divida` não é dispensa de conferir.** Um recorte com `divida` congela o
conjunto exato de arquivos da janela e a impressão digital das violações.
Arquivo novo caindo na janela, arquivo que sumiu ou violação a mais reprovam com
exit 1. O roster de nomes que podem carregar `divida` é fechado e mora em
`DIVIDAS_CONGELADAS`, no código do checker: declarar dívida nova exige mudar
código, não acrescentar uma linha ao JSON que você já está editando. Migration
nova nunca entra por aí, ela precisa de recorte próprio com allowlist.

**Armadilha do `unstable_cache` em `src/lib/api.ts`.** O TTL é de 3600s. Nunca
retorne `degradedResource` nem lista vazia de dentro do cache numa falha: o valor
errado congela por uma hora. Lance, porque rejeição não entra no cache.
