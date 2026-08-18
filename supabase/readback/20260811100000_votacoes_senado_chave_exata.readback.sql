-- Readback somente leitura e fail-closed da 20260811100000.
DO $readback$
DECLARE
  v_ledger integer;
  v_linhas integer;
  v_pares integer;
  v_eventos integer;
  v_invalidos integer;
  v_assinatura_linhas text;
  v_assinatura_pares text;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260811100000';
  SELECT count(*), count(DISTINCT votacao_id_api)
    INTO v_linhas, v_eventos
    FROM public.votacoes_chave
   WHERE casa = 'Senado' AND fonte = 'senado';
  SELECT count(*) INTO v_pares
    FROM public.votos_candidato v
    JOIN public.votacoes_chave k ON k.id = v.votacao_id
   WHERE k.casa = 'Senado';
  SELECT count(*) INTO v_invalidos
    FROM public.votos_candidato v
    JOIN public.votacoes_chave k ON k.id = v.votacao_id
   WHERE k.casa = 'Senado'
     AND v.voto NOT IN ('sim', 'não', 'abstenção', 'obstrução');

  SELECT md5(string_agg(
           concat_ws(chr(30), id::text, titulo, coalesce(descricao,'<null>'),
             coalesce(data_votacao::text,'<null>'), casa,
             coalesce(proposicao_id,'<null>'), coalesce(tema,'<null>'),
             coalesce(impacto_popular,'<null>'),
             to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),
             coalesce(fonte,'<null>'), coalesce(votacao_id_api,'<null>')),
           chr(31) order by id::text))
    INTO v_assinatura_linhas
    FROM public.votacoes_chave where casa='Senado';
  SELECT md5(string_agg(
           concat_ws(chr(30), c.slug, v.votacao_id::text, v.voto,
             v.contradicao::text, coalesce(v.contradicao_descricao,'<null>')),
           chr(31) order by c.slug, v.votacao_id::text))
    INTO v_assinatura_pares
    FROM public.votos_candidato v
    JOIN public.votacoes_chave k ON k.id=v.votacao_id
    JOIN public.candidatos c ON c.id=v.candidato_id
   WHERE k.casa='Senado';

  IF v_ledger <> 1 OR v_linhas <> 6 OR v_eventos <> 6 OR v_pares <> 75
     OR v_invalidos <> 0
     OR v_assinatura_linhas <> 'db7785f89d8a3ebe8796503141fa89d0'
     OR v_assinatura_pares <> 'cbd5058dba59cb878be302826ce3ac7f' THEN
    RAISE EXCEPTION 'readback 20260811100000: ledger=% linhas=% eventos=% pares=% invalidos=% assinatura_linhas=% assinatura_pares=%', v_ledger, v_linhas, v_eventos, v_pares, v_invalidos, v_assinatura_linhas, v_assinatura_pares;
  END IF;
END
$readback$;

SELECT k.titulo, k.data_votacao, k.proposicao_id, k.votacao_id_api, count(v.id) AS pares
  FROM public.votacoes_chave k
  LEFT JOIN public.votos_candidato v ON v.votacao_id = k.id
 WHERE k.casa = 'Senado'
 GROUP BY k.id
 ORDER BY k.data_votacao, k.votacao_id_api;
