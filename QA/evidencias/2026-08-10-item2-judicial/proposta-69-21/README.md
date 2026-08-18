# Lote judicial adicional 69/21

Estado em 11/08/2026: aprovado editorialmente nesta sessão como carga adicional,
preparado localmente e não aplicado.

O lote contém 69 CNJs únicos em 21 fichas. Ele é disjunto do lote complementar
66/25 e não o substitui. A aprovação desta pasta não aprova automaticamente as
66 linhas da pasta `../proposta-66-25/`.

## Contrato aplicável preparado

- migration: `supabase/migrations/20260810122000_processos_curadoria_djen.sql`;
- allowlist: `scripts/audit/allowlist-processos-curadoria-20260810.json`;
- rollback: `supabase/rollback/20260810122000_processos_curadoria_djen.rollback.sql`;
- readback exato: `20260810122000_processos_curadoria_djen.readback.sql`;
- manifesto nominal e payload completo: `manifesto-processos-curadoria-69.json`.

A migration recusa universo vazio ou parcial, CNJ já existente e cardinalidade
divergente. Ela também recusa qualquer URL do Comunica PJe cujo
`numeroProcesso` não seja o CNJ da própria linha. O readback repete essa
invariante e compara identidade, tipo, tribunal, descrição, status, fonte e URL
de todas as 69 linhas. O rollback recusa apagar qualquer linha que tenha
recebido curadoria posterior e só remove o ledger após o pós-check.

## Auditoria de URL por processo

Antes da correção, 55 das 69 linhas usavam o Comunica PJe: 45 apontavam para o
próprio CNJ e 10 para o processo representativo de um grupo. As 10 divergências
eram Alexandre Kalil (7), Ataídes Oliveira (2) e Romeu Zema (1). As outras 14
linhas usam documentos diretos de tribunais e não entravam nessa comparação por
parâmetro.

O gerador agora escolhe a fonte exata do processo, em vez da primeira URL HTTPS
do grupo. Depois da regeneração, são 55/55 URLs do Comunica PJe amarradas ao CNJ
correto, 0 divergências e as 14 fontes documentais preservadas. As 10 consultas
específicas foram reabertas de forma somente leitura em 11/08/2026: 10 respostas
HTTP 200 e 10 com o CNJ esperado no payload. A contagem externa de 16 não foi
reproduzida; sem uma lista nominal dos outros seis, nenhuma fonte documental foi
alterada por inferência.

## Prova local

`npm run audit:processos:curadoria-69:provar` executa cinco cenários em
Postgres 17 efêmero: universo vazio, coorte parcial, aplicação exata,
reaplicação e rollback com e sem uma URL adversarial que aponta para outro CNJ.

Nenhuma migration foi aplicada em ambiente remoto. Aplicação, deploy e readback
público continuam dependendo de autorizações posteriores que nomeiem cada ato.
