-- Snapshot da superfície de verificação das fichas públicas (2026-08-15).
--
-- Uma linha JSON por candidato público, com EXATAMENTE o que a ficha lê para
-- montar selo, Destaques e cards de fonte:
--   - verificacao_campos  (selo: chaves TSE + existing_profile_aggregate)
--   - pontos_visiveis     (itens editoriais publicados na aba Destaques)
--   - destaques_totais    (controle para não mascarar item oculto sem revisão)
--   - destaques_ocultos_revisados (vazio editorial deliberado e auditável)
--   - coletas             (cards "Estado das outras fontes": as duas fontes
--                          que src/lib/api.ts consulta em coleta_log_ultima)
--   - ultima_atualizacao  (fallback do selo curado)
--   - foto_url             (R11: placeholder reprova; null vira aviso nominal)
--   - linhas_abas         (R5: linha publicada ou recibo de estado por aba)
--   - textos_publicos     (R6-R7: campos que a API/DOM servem como texto)
--   - integridade_partidaria (R8-R10: cadeia visível e suporte na trajetória)
--
-- Somente leitura. Consumido por scripts/audit/audit-superficie.ts, que aplica
-- as regras mecânicas e reprova. Origem da régua: incidente Augusto Cury
-- (15/08: selo de 09/06, 0 destaques e cards "não foi possível verificar" numa
-- ficha declarada 25/25; o QA comparava ledger e banco, nunca a superfície).
select coalesce(json_agg(linha order by linha->>'slug'), '[]'::json) as snapshot
from (
  select json_build_object(
    'slug', c.slug,
    'publica', coalesce(c.publicavel = true and c.status <> 'removido', false),
    'foto_url', c.foto_url,
    'verificacao_campos', c.verificacao_campos,
    'ultima_atualizacao', c.ultima_atualizacao,
    'pontos_visiveis', (
      select count(*)
      from pontos_atencao p
      where p.candidato_id = c.id
        and p.visivel = true
    ),
    'destaques_totais', (
      select count(*)
      from pontos_atencao p
      where p.candidato_id = c.id
    ),
    'destaques_ocultos_revisados', (
      select count(*)
      from pontos_atencao p
      where p.candidato_id = c.id
        and p.visivel = false
        and p.verificado = true
        and p.despublicacao_motivo is not null
        and p.despublicado_em is not null
    ),
    'coletas', (
      select coalesce(
        json_object_agg(
          u.fonte,
          json_build_object('resultado', u.resultado, 'executado_em', u.executado_em)
        ),
        '{}'::json
      )
      from coleta_log_ultima u
      where u.escopo = 'candidato'
        and u.alvo = c.slug
        and u.fonte in ('transparencia-sanctions', 'processos-curadoria')
    ),
    'linhas_abas', json_build_object(
      'votacoes_chave', (
        select count(*)
        from votos_candidato vc
        where vc.candidato_id = c.id
      ),
      'historico_politico', (
        select count(*)
        from historico_politico h
        where h.candidato_id = c.id
          and h.despublicado_em is null
      )
    ),
    'integridade_partidaria', json_build_object(
      'mudancas_visiveis', (
        select coalesce(
          json_agg(
            json_build_object(
              'id', m.id,
              'ano', m.ano,
              'partido_anterior', m.partido_anterior,
              'partido_novo', m.partido_novo,
              'data_mudanca', m.data_mudanca,
              'contexto', m.contexto
            )
            order by coalesce(m.data_mudanca, make_date(m.ano, 12, 31)), m.id
          ),
          '[]'::json
        )
        from mudancas_partido m
        where m.candidato_id = c.id
          and m.despublicado_em is null
      ),
      'partidos_historico_visivel', (
        select coalesce(json_agg(distinct h.partido), '[]'::json)
        from historico_politico h
        where h.candidato_id = c.id
          and h.despublicado_em is null
          and h.partido is not null
      ),
      'partidos_historico_despublicado', (
        select coalesce(json_agg(distinct h.partido), '[]'::json)
        from historico_politico h
        where h.candidato_id = c.id
          and h.despublicado_em is not null
          and h.partido is not null
      )
    ),
    'textos_publicos', (
      select coalesce(
        json_agg(json_build_object('campo', textos.campo, 'texto', textos.texto)),
        '[]'::json
      )
      from (
        select 'maiores_doadores.nome'::text as campo, doador->>'nome' as texto
        from financiamento_publico f
        cross join lateral jsonb_array_elements(coalesce(f.maiores_doadores, '[]'::jsonb)) doador
        where f.candidato_id = c.id

        union all

        select 'historico_politico.observacoes', h.observacoes
        from historico_politico h
        where h.candidato_id = c.id
          and h.despublicado_em is null
          and h.observacoes is not null

        union all

        select 'pontos_atencao.titulo', p.titulo
        from pontos_atencao p
        where p.candidato_id = c.id
          and p.visivel = true

        union all

        select 'pontos_atencao.descricao', p.descricao
        from pontos_atencao p
        where p.candidato_id = c.id
          and p.visivel = true
      ) textos
      where textos.texto is not null
    )
  ) as linha
  from candidatos c
  -- R1-R7 usam apenas as fichas públicas; R8-R10 também nomeiam o backlog das
  -- candidaturas ainda não públicas, sem convertê-lo em falha permanente.
) t;
