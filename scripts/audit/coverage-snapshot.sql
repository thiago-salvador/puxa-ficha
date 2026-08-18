-- Snapshot de cobertura por candidato (somente leitura), 2026-08-02.
--
-- Devolve UMA linha, UMA coluna (`snapshot`), com o array JSON que
-- `scripts/audit/coverage-report.ts --from-snapshot=PATH` consome. Existe para
-- que o relatório possa ser gerado em ambiente sem SUPABASE_SERVICE_ROLE_KEY na
-- máquina (o script também sabe ler o banco direto quando as credenciais estão
-- presentes; o resultado é o mesmo).
--
-- Rodar com: psql, o SQL editor do Supabase, ou o MCP do Supabase, e salvar o
-- valor da coluna `snapshot` num arquivo .json.
--
-- Fonte da idade: a view pública `candidatos_publico`, que faz
-- COALESCE(idade, extract(year from age(data_nascimento))). A coluna crua
-- `candidatos.idade` é NULL para todo mundo e subcontaria "dados pessoais".

select jsonb_agg(linha order by linha->>'slug') as snapshot
from (
  select jsonb_build_object(
    'slug', c.slug,
    'nome_urna', coalesce(c.nome_urna, c.slug),
    'partido_sigla', c.partido_sigla,
    'cargo_disputado', c.cargo_disputado,
    'estado', c.estado,
    'foto', nullif(btrim(c.foto_url), '') is not null,
    'foto_url', c.foto_url,
    'foto_origem', case
      when nullif(btrim(c.foto_url), '') is null then null
      when c.foto_url like '/%' and c.foto_url not like '//%' then 'local'
      when lower(c.foto_url) ~ '^https?://([a-z0-9-]+\.)*tse\.jus\.br([/:?#]|$)' then 'tse'
      when lower(c.foto_url) ~ '^https?://([a-z0-9-]+\.)*(wikimedia|wikipedia)\.org([/:?#]|$)' then 'wikimedia'
      when lower(c.foto_url) ~ '^https?://([a-z0-9-]+\.)*(camara\.leg\.br|senado\.leg\.br|gov\.br)([/:?#]|$)' then 'oficial'
      else 'terceiro'
    end,
    'bio', c.biografia is not null,
    'redes', coalesce(c.redes_sociais, '{}'::jsonb) <> '{}'::jsonb
             and coalesce(c.redes_sociais, '[]'::jsonb) <> '[]'::jsonb,
    'idade', c.idade,
    'naturalidade', c.naturalidade,
    'formacao', c.formacao,
    'profissao', c.profissao_declarada,
    -- Ultima tentativa de coleta por fonte, de public.coleta_log_ultima. E o que
    -- permite separar "verificamos e nao ha" de "nunca fomos buscar" nas 954
    -- celulas que hoje caem no estado `zero`. Ausencia de chave para uma fonte
    -- significa nunca verificado, e e leitura pela negativa de proposito: nao
    -- existe momento em que gravar "nunca fui la". Ver
    -- scripts/audit/lib/coleta-proveniencia.ts.
    --
    -- BLOCO OPCIONAL, delimitado pelos marcadores abaixo. Em banco sem a
    -- migration `coleta_log`, `lib/snapshot-fetch.ts` remove daqui ate o
    -- marcador de fim antes de enviar a consulta, e o snapshot sai sem a chave
    -- `coleta` (que o modelo le como procedencia nao lida). Nao da para
    -- resolver isso com `to_regclass` dentro do proprio SELECT: a relacao e
    -- resolvida na analise do comando, entao a consulta inteira falharia antes
    -- de qualquer guarda em tempo de execucao rodar. Mexer nos marcadores exige
    -- mexer no strip; `tests/coverage-proveniencia.test.ts` cobre os dois.
    -- @coleta-opcional-inicio
    'coleta', coalesce((
      select jsonb_object_agg(u.fonte, jsonb_build_object(
        'resultado', u.resultado,
        'volume', u.volume,
        'executado_em', u.executado_em,
        'detalhe', u.detalhe))
      from coleta_log_ultima u
      where u.escopo = 'candidato' and u.alvo = c.slug), '{}'::jsonb),
    -- @coleta-opcional-fim
    'historico', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cargo_canonico', h.cargo_canonico,
        'tipo_evento', h.tipo_evento,
        'periodo_inicio', h.periodo_inicio,
        'periodo_fim', h.periodo_fim,
        'proveniencia', h.proveniencia))
      from historico_politico h
      where h.candidato_id = c.id and h.despublicado_em is null), '[]'::jsonb),
    'mudancas', (select count(*) from mudancas_partido m where m.candidato_id = c.id),
    'patrimonioAnos', coalesce((
      select jsonb_agg(p.ano_eleicao) from patrimonio p where p.candidato_id = c.id), '[]'::jsonb),
    'patrimonioAnosComBens', coalesce((
      select jsonb_agg(p.ano_eleicao) from patrimonio p
      where p.candidato_id = c.id and jsonb_typeof(p.bens) = 'array'
        and jsonb_array_length(p.bens) > 0), '[]'::jsonb),
    -- Ausencias oficiais de patrimonio: eleicoes em que o pacote oficial
    -- bem_candidato do TSE foi lido de ponta a ponta e nao trouxe bens para o
    -- SQ_CANDIDATO (tabela patrimonio_ausencia_oficial). A regua de patrimonio
    -- conta esses anos como cobertura, nao como lacuna.
    --
    -- BLOCO OPCIONAL, delimitado pelos marcadores abaixo, pelos mesmos motivos
    -- do bloco de coleta: a relacao e resolvida na analise do comando, entao
    -- `to_regclass` dentro do proprio SELECT chegaria tarde. Em banco sem a
    -- migration (a tabela so existe apos o apply), `lib/snapshot-fetch.ts`
    -- remove daqui ate o marcador de fim e o snapshot sai sem a chave
    -- `patrimonioAusenciasOficiais`, que o leitor normaliza para lista vazia:
    -- ausencia de prova nao vira prova de ausencia. Mexer nos marcadores exige
    -- mexer no strip; `tests/coverage-proveniencia.test.ts` cobre os dois.
    -- @ausencias-opcionais-inicio
    'patrimonioAusenciasOficiais', coalesce((
      select jsonb_agg(a.ano_eleicao order by a.ano_eleicao)
      from patrimonio_ausencia_oficial a
      where a.candidato_id = c.id), '[]'::jsonb),
    -- @ausencias-opcionais-fim
    'financiamentoAnos', coalesce((
      select jsonb_agg(f.ano_eleicao) from financiamento f where f.candidato_id = c.id), '[]'::jsonb),
    'financiamentoAnosComDoadores', coalesce((
      select jsonb_agg(f.ano_eleicao) from financiamento f
      where f.candidato_id = c.id and jsonb_typeof(f.maiores_doadores) = 'array'
        and jsonb_array_length(f.maiores_doadores) > 0), '[]'::jsonb),
    'votos', (select count(*) from votos_candidato v where v.candidato_id = c.id),
    'contradicoes', (
      select count(*) from pontos_atencao pa
      where pa.candidato_id = c.id and pa.visivel
        and translate(pa.categoria, 'áéíóúãõçâêô', 'aeiouaocaeo') in ('contradicao', 'mudanca_posicao')),
    'processos', (select count(*) from processos pr where pr.candidato_id = c.id),
    'alertas', (
      select count(*) from pontos_atencao pa
      where pa.candidato_id = c.id and pa.visivel and pa.categoria <> 'feito_positivo'),
    'projetos', (select count(*) from projetos_lei pl where pl.candidato_id = c.id),
    -- Issue #138: a comparacao com a cardinalidade declarada pela Camara so vale
    -- contra o acervo QUE VEIO DA CAMARA. Somar Senado e curadoria no mesmo
    -- numero recriaria o falso completo (100 da Camara + 104 do Senado passando
    -- por 204 declaradas).
    'projetosCamara', (
      select count(*) from projetos_lei pl
      where pl.candidato_id = c.id and pl.fonte = 'Camara'),
    'destaquesTotais', (select count(*) from projetos_lei pl where pl.candidato_id = c.id and pl.destaque),
    -- A ficha carrega só os 25 mais recentes (ano desc, numero desc) e ordena
    -- destaque primeiro DENTRO dessa fatia. Destaque antigo não aparece.
    'destaquesVisiveis', (
      select count(*) from (
        select pl.destaque,
               row_number() over (order by pl.ano desc nulls last, pl.numero desc nulls last) as rk
        from projetos_lei pl where pl.candidato_id = c.id
      ) t where t.destaque and t.rk <= 25),
    'gastosAnos', coalesce((
      select jsonb_agg(g.ano) from gastos_parlamentares g where g.candidato_id = c.id), '[]'::jsonb),
    'legislacaoExecutivo', (
      select count(*) from legislacao_mandato_executivo l where l.candidato_id = c.id),
    'noticias', (select count(*) from noticias_candidato n where n.candidato_id = c.id),
    -- Só o que o quiz consome (`.eq("verificado", true)` em src/lib/api.ts).
    'posicoesTemasVerificados', coalesce((
      select jsonb_agg(distinct pd.tema) from posicoes_declaradas pd
      where pd.candidato_id = c.id and pd.verificado), '[]'::jsonb),
    'posicoesTemasPendentes', coalesce((
      select jsonb_agg(distinct pd.tema) from posicoes_declaradas pd
      where pd.candidato_id = c.id and pd.verificado = false), '[]'::jsonb),
    'posicoesTemasSemDeclaracao', coalesce(
      case
        when jsonb_typeof(c.verificacao_campos -> 'posicoes_quiz_temas_sem_declaracao') = 'array'
          then c.verificacao_campos -> 'posicoes_quiz_temas_sem_declaracao'
        else '[]'::jsonb
      end,
      '[]'::jsonb
    ),
    'sancoes', (select count(*) from sancoes_administrativas s where s.candidato_id = c.id),
    -- TODAS as claims (pontos de atenção) do candidato, publicadas ou não.
    -- Alimenta `claims-report.ts`; a coluna "alertas" acima conta só as visíveis.
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id, 'categoria', pa.categoria, 'gravidade', pa.gravidade,
        'titulo', pa.titulo, 'descricao', pa.descricao,
        'visivel', pa.visivel, 'verificado', pa.verificado, 'gerado_por', pa.gerado_por,
        'despublicacao_motivo', pa.despublicacao_motivo,
        'data_referencia', pa.data_referencia,
        'urls', coalesce((select jsonb_agg(f->>'url') from jsonb_array_elements(
            case when jsonb_typeof(pa.fontes) = 'array' then pa.fontes else '[]'::jsonb end) f
          where f->>'url' is not null), '[]'::jsonb)
      ) order by pa.gravidade, pa.titulo)
      from pontos_atencao pa where pa.candidato_id = c.id), '[]'::jsonb),
    -- Fila de revisão: o que depende de decisão humana para mudar o site.
    'itensRevisar', coalesce((
      select jsonb_agg(item order by item->>'classe', item->>'titulo') from (
        select jsonb_build_object(
          'id', pd.id, 'classe', 'posicao_nao_verificada',
          'titulo', pd.tema, 'detalhe', pd.descricao,
          'fonte', pd.fonte, 'url', pd.url_fonte,
          'efeito', 'Aprovar coloca esta posicao no calculo do quiz presidencial.'
        ) as item
        from posicoes_declaradas pd
        where pd.candidato_id = c.id and pd.verificado = false
        union all
        select jsonb_build_object(
          'id', pa.id, 'classe', 'ponto_atencao_pendente',
          'titulo', pa.titulo, 'detalhe', pa.descricao,
          'fonte', pa.gerado_por, 'url', (
            select f->>'url' from jsonb_array_elements(
              case when jsonb_typeof(pa.fontes) = 'array' then pa.fontes else '[]'::jsonb end) f
            where f->>'url' is not null limit 1),
          'efeito', 'Aprovar publica este ponto de atencao na ficha.'
        )
        from pontos_atencao pa
        where pa.candidato_id = c.id and pa.visivel = false and pa.despublicacao_motivo is null
        union all
        select jsonb_build_object(
          'id', pa.id, 'classe', 'ponto_atencao_ia_no_ar_sem_revisao',
          'titulo', pa.titulo, 'detalhe', pa.descricao,
          'fonte', pa.gerado_por, 'url', (
            select f->>'url' from jsonb_array_elements(
              case when jsonb_typeof(pa.fontes) = 'array' then pa.fontes else '[]'::jsonb end) f
            where f->>'url' is not null limit 1),
          'efeito', 'Ja esta no ar sem revisao humana. Rejeitar tira do ar.'
        )
        from pontos_atencao pa
        where pa.candidato_id = c.id and pa.visivel and pa.gerado_por = 'ia' and pa.verificado = false
      ) itens), '[]'::jsonb)
  ) as linha
  from candidatos_publico c
) t;
