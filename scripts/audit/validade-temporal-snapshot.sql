-- Snapshot das afirmacoes com prazo de validade nas fichas publicaveis (2026-08-16).
--
-- Uma linha JSON por candidato publicavel, com o par que o gate precisa cruzar:
--   - as COLUNAS que carregam afirmacao dependente do tempo (situacao de
--     candidatura, filiacao, cargo em disputa, mandato corrente, e a prosa da
--     biografia, que foi onde o incidente de 15/08 apareceu);
--   - o jsonb `verificacao_campos` inteiro, que e onde mora (ou falta) a data
--     de verificacao de cada uma delas.
--
-- O jsonb sai CRU de proposito. A resolucao da data acontece no TypeScript
-- porque as chaves de data divergem no banco: umas usam `verificado_em`, outras
-- `em`, algumas nao tem chave de data nenhuma e outras guardam a data dentro de
-- sub-objetos. Resolver isso em SQL espalharia a regra por dois lugares, e a
-- divergencia e justamente um dos achados que o relatorio precisa contar.
--
-- Somente leitura. Consumido por scripts/audit/audit-validade-temporal.ts.
select coalesce(json_agg(linha order by linha->>'slug'), '[]'::json) as snapshot
from (
  select json_build_object(
    'slug', c.slug,
    'estado', c.estado,
    'situacao_candidatura', c.situacao_candidatura,
    'partido_atual', c.partido_atual,
    'partido_sigla', c.partido_sigla,
    'cargo_disputado', c.cargo_disputado,
    'cargo_atual', c.cargo_atual,
    'biografia', c.biografia,
    'verificacao_campos', c.verificacao_campos,
    'ultima_atualizacao', c.ultima_atualizacao
  ) as linha
  from candidatos c
  -- So o que o leitor ve. Ficha nao publicavel pode ter afirmacao velha sem
  -- mentir para ninguem; publicada, a mesma afirmacao vira promessa ao publico.
  where c.publicavel = true
    and c.status <> 'removido'
) t;
