# Correção fechada dos textos de julgamento

## Escopo e estado

Pré-estado conferido em 05/09/2026. Pacote preparado, ainda não aplicado
neste snapshot. A situação estruturada já havia sido atualizada pelo ingest;
ele não reescreve biografias ou observações históricas persistidas.
A origem da redação padronizada não foi atribuída a um escritor específico.

O manifesto `scripts/audit/dados-textos-julgamento-20260905.json` congela
188 campos: 63 biografias e 125 observações, em 138 fichas. Remove apenas
as cláusulas padronizadas de espera já superadas e o marcador `#NULO` da
observação de 2010 de Rico Pinheiro. Não traduz julgamentos para prosa,
não revisa conteúdo individual e não altera timestamps ou outras colunas.

Referências datadas legítimas, textos de fichas ainda aguardando julgamento
e a redação individual de Cadu Xavier permanecem fora da correção.

## Aplicação e reversão

1. Integrar o pacote com CI aprovado. Despachar
   `apply-textos-julgamento-production.yml` em `main`, com `expected_sha`
   igual ao SHA completo de seu topo remoto. O predecessor exigido é
   `20260904220000`, com digest conferido contra o arquivo versionado.
2. O workflow prova o pacote em PG17 descartável antes de conectar a
   produção. O driver valida identidade, SQ, situação, coorte pública e
   texto anterior dos 188 alvos, bloqueia as linhas e captura pré-imagem
   antes da primeira escrita. Uma divergência aborta o lote inteiro.
3. Migration, recibo, ledger e readback ficam na mesma transação. A leitura
   final independente e a superfície pública precisam confirmar os 188
   textos posteriores; revalidar o cache pelo workflow canônico.
4. Em reversão, despachar `rollback-textos-julgamento-production.yml`
   no topo de `main`. O rollback exige a migration no topo do ledger e
   os textos ainda iguais ao pós-estado; restaura somente o campo do
   recibo, preservando mudanças em outras colunas. Se outro editor já
   mudou o texto, recusa sobrescrevê-lo. Não reaplicar após rollback.

## Provas

`bash scripts/audit/provar-textos-julgamento-pg17.sh` exercita forward,
recibo, reaplicação sem escrita, coorte ausente, coorte parcial, alterações
de identidade e pré-estado, trigger real, recibo adulterado, rollback e
preservação de outras colunas. A fixture contém 19 objetos extraídos por
`pg_dump --schema-only --schema=public` do projeto de produção, com origem
e hashes em `tests/fixtures/textos-julgamento-schema-source.json`.

Gates medidos: replay conserva 346 aplicadas + 105 falhas históricas = 451;
schema gate conserva `c44bc413c4db5f2a5e6fdc12e448973953d6202a55b25cfd7e9979dd40537279`.
Os readbacks são guardas deste snapshot, não prova de que a fonte TSE ou
a situação de uma ficha nunca voltará a mudar.
