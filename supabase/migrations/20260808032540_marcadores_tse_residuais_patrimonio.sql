-- RENOMEADA em 08/08/2026, de 20260808010000 para 20260808032540. Foi aplicada
-- pelo apply_migration do MCP da Management API, que carimba timestamp próprio
-- no ledger em vez de usar o nome do arquivo. O ledger registrou 20260808032540
-- com estes mesmos statements, e o arquivo passou a levar a versão que de fato
-- aconteceu. O caso está documentado em
-- docs/arquivo/ledger-divergencia-20260808.md.
--
-- Remove os marcadores técnicos do TSE (#NULO#, #NE#) que sobraram na descrição
-- de bens declarados de dois candidatos publicados.
--
-- Por que sobraram: a normalização de 07/08 rodou por
-- scripts/normalizar-marcadores-publicos.ts, cujo readback final chamava
-- readPatrimonio() e readHistorico() sem o argumento candidateIds. Executado
-- por tsx, que não faz typecheck, o erro passou; a verificação foi ao banco sem
-- o filtro dos 194 publicados e por isso reportou "zero marcador restante" sem
-- ter conferido esse recorte. O relatório em QA/2026-08-07-resumo-sessao.md
-- registra essa afirmação, que não se sustenta. A chamada foi corrigida em
-- c16c55a; esta migration fecha o dado que ficou para trás.
--
-- Não houve exposição pública: a ficha já sanitiza na camada de exibição
-- (sanitizePublicText em src/lib/public-text.ts), e produção foi conferida em
-- 08/08 sem ocorrência do marcador no HTML de nenhum dos dois. O que se corrige
-- aqui é o dado armazenado, para o banco parar de contradizer o relatório.
--
-- A convenção é a mesma do script e da camada pública: o marcador vira string
-- vazia, espaços duplicados colapsam e a string é trimada. O registro já
-- normalizado de hertz-dias serve de referência ("descricao": "").
--
-- Sem BEGIN/COMMIT explícito de propósito: tanto `supabase db push` quanto o
-- apply_migration da Management API já envolvem cada migration na própria
-- transação, e o COMMIT interno encerraria a transação externa antes das
-- pós-condições rodarem.
--
-- Escopo medido antes de aplicar: 9 itens com marcador, 1 em coronel-busnello e
-- 8 em patrus-ananias, todos com o valor exato "#NULO#".

-- @write tabela=patrimonio slug=coronel-busnello campos=bens_descricao_marcador
-- @write tabela=patrimonio slug=patrus-ananias campos=bens_descricao_marcador
UPDATE public.patrimonio p
SET bens = (
      SELECT jsonb_agg(
               CASE
                 WHEN item->>'descricao' ~* '#(NULO|NE)#?'
                 THEN jsonb_set(
                        item,
                        '{descricao}',
                        to_jsonb(
                          btrim(
                            regexp_replace(
                              regexp_replace(item->>'descricao', '#(NULO|NE)#?', '', 'gi'),
                              '\s{2,}', ' ', 'g'
                            )
                          )
                        )
                      )
                 ELSE item
               END
               ORDER BY ord
             )
      FROM jsonb_array_elements(p.bens) WITH ORDINALITY AS t(item, ord)
    )
FROM public.candidatos c
WHERE p.candidato_id = c.id
  AND c.slug IN ('coronel-busnello', 'patrus-ananias')
  AND p.bens::text ~* '#(NULO|NE)#?';

DO $$
DECLARE
  restantes integer;
  vazias integer;
BEGIN
  -- Pós-condição 1: nenhum marcador sobra no recorte publicado.
  SELECT COUNT(*) INTO restantes
  FROM public.patrimonio p
  WHERE p.candidato_id IN (SELECT id FROM public.candidatos_publico)
    AND p.bens::text ~* '#(NULO|NE)#?';

  IF restantes <> 0 THEN
    RAISE EXCEPTION 'ainda restam % linha(s) de patrimonio com marcador no recorte publicado', restantes;
  END IF;

  -- Pós-condição 2: o saneamento produziu descrição vazia, não apagou o bem.
  -- Medido antes: 1 item em coronel-busnello e 8 em patrus-ananias.
  SELECT COUNT(*) INTO vazias
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  CROSS JOIN LATERAL jsonb_array_elements(p.bens) AS b(item)
  WHERE c.slug IN ('coronel-busnello', 'patrus-ananias')
    AND b.item->>'descricao' = '';

  IF vazias < 9 THEN
    RAISE EXCEPTION 'esperadas 9 descricoes vazias apos o saneamento; encontrado %', vazias;
  END IF;
END $$;
