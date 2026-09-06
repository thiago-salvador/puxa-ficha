-- Fecha quatro lacunas reais de patrimonio eleitoral de 2026.
-- Fonte: TSE bem_candidato_2026.zip, SHA-256
-- 072569c46a14df0ab0b42cc96607984003231723af852ca296472273c7a22d4b,
-- consultada em 2026-09-06T15:06:23.698Z.
-- Identidade ancorada por SQ_CANDIDATO, nunca por nome.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'patrimonio 2026: coorte ausente no replay; correção ignorada';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    SELECT count(*) INTO quantidade
    FROM public.candidatos
    WHERE (slug,sq_candidato_2026) IN (
      ('rico-pinheiro','70002553982'),
      ('ruth-reis','140002554434'),
      ('dr-luisinho','10002533539'),
      ('well-macedo','140002554108')
    );
    IF quantidade<>4 THEN
      RAISE EXCEPTION 'patrimonio 2026: identidade esperada=4 atual=%', quantidade;
    END IF;

    SELECT count(*) INTO quantidade
    FROM (
      SELECT p.candidato_id
      FROM public.patrimonio p
      JOIN public.candidatos c ON c.id=p.candidato_id
      WHERE c.slug IN ('rico-pinheiro','ruth-reis') AND p.ano_eleicao=2026
      UNION ALL
      SELECT a.candidato_id
      FROM public.patrimonio_ausencia_oficial a
      JOIN public.candidatos c ON c.id=a.candidato_id
      WHERE c.slug IN ('dr-luisinho','well-macedo') AND a.ano_eleicao=2026
    ) existente;
    IF quantidade<>0 THEN
      RAISE EXCEPTION 'patrimonio 2026: preimage esperada vazia, linhas=%', quantidade;
    END IF;
  END IF;

  -- @write tabela=patrimonio slug=rico-pinheiro ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  -- @write tabela=patrimonio slug=ruth-reis ano=2026 campos=candidato_id,ano_eleicao,valor_total,bens,fonte
  INSERT INTO public.patrimonio (candidato_id,ano_eleicao,valor_total,bens,fonte)
  SELECT c.id, 2026, 4380000::numeric, $bens$[{"tipo":"Outras participações societárias","descricao":"PARTICIPAÇÃO EM SCP","valor":1800000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"NISSAN VERSA","valor":80000},{"tipo":"Quotas ou quinhões de capital","descricao":"PARTICIPAÇÃO LTDA","valor":2500000}]$bens$::jsonb, 'TSE'
  FROM public.candidatos c
  WHERE c.slug='rico-pinheiro' AND c.sq_candidato_2026='70002553982'
  UNION ALL
  SELECT c.id, 2026, 1324017.48::numeric, $bens$[{"tipo":"Outros bens móveis","descricao":"08 COMPUTADORES COMPLETOS","valor":17580},{"tipo":"Terreno","descricao":"UM TERRENO","valor":62800},{"tipo":"Casa","descricao":"UMA CASA RESIDENCIAL","valor":48900},{"tipo":"Quotas ou quinhões de capital","descricao":"CNPJ: [documento mascarado]","valor":60000},{"tipo":"Outros bens móveis","descricao":"MOVEIS E UTENSILIOS","valor":8360},{"tipo":"Depósito bancário em conta corrente no País","descricao":"SALDO CONTA CORRENTE","valor":1},{"tipo":"Caderneta de poupança","descricao":"BANCO BRADESCO S.A - SALDO CONTA POUPANCA","valor":4763.98},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"JEEP RENEGADE LONGITUDE T270 FLEX","valor":146023},{"tipo":"Apartamento","descricao":"UM APARTAMENTO ED. PRIME","valor":274000},{"tipo":"Casa","descricao":"CASA RESIDENCIAL","valor":700000},{"tipo":"Depósito bancário em conta corrente no País","descricao":"DINHEIRO EM CONTA CORRENTE","valor":1589.5}]$bens$::jsonb, 'TSE'
  FROM public.candidatos c
  WHERE c.slug='ruth-reis' AND c.sq_candidato_2026='140002554434'
  ON CONFLICT (candidato_id,ano_eleicao) DO NOTHING;

  -- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2026 campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
  -- @write tabela=patrimonio_ausencia_oficial slug=well-macedo ano=2026 campos=candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao
  INSERT INTO public.patrimonio_ausencia_oficial
    (candidato_id,ano_eleicao,sq_candidato,fonte_url,verificado_em,detalhe,execucao)
  SELECT c.id, 2026, '10002533539',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', timestamptz '2026-09-06T15:06:23.698Z',
         'Identidade confirmada por SQ_CANDIDATO, ano e UF; consulta_cand registra ST_DECLARAR_BENS=N e o pacote oficial completo não traz bens para a candidatura.', 'migration:20260906153000'
  FROM public.candidatos c
  WHERE c.slug='dr-luisinho' AND c.sq_candidato_2026='10002533539'
  UNION ALL
  SELECT c.id, 2026, '140002554108',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip', timestamptz '2026-09-06T15:06:23.698Z',
         'Identidade confirmada por SQ_CANDIDATO, ano e UF; consulta_cand registra ST_DECLARAR_BENS=N e o pacote oficial completo não traz bens para a candidatura.', 'migration:20260906153000'
  FROM public.candidatos c
  WHERE c.slug='well-macedo' AND c.sq_candidato_2026='140002554108'
  ON CONFLICT (candidato_id,ano_eleicao) DO NOTHING;

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    SELECT count(*) INTO quantidade FROM (
      SELECT p.candidato_id FROM public.patrimonio p
      JOIN public.candidatos c ON c.id=p.candidato_id
      WHERE (c.slug,p.ano_eleicao,p.valor_total,jsonb_array_length(p.bens)) IN (
        ('rico-pinheiro',2026,4380000::numeric,3),
        ('ruth-reis',2026,1324017.48::numeric,11)
      )
      UNION ALL
      SELECT a.candidato_id FROM public.patrimonio_ausencia_oficial a
      JOIN public.candidatos c ON c.id=a.candidato_id
      WHERE (c.slug,a.ano_eleicao,a.sq_candidato) IN (
        ('dr-luisinho',2026,'10002533539'),
        ('well-macedo',2026,'140002554108')
      )
    ) aplicado;
    IF quantidade<>4 THEN
      RAISE EXCEPTION 'patrimonio 2026: pos-condicao esperada=4 atual=%', quantidade;
    END IF;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260906153000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-bem-candidato-2026','candidato','patrimonio',c.id,
         CASE WHEN c.slug IN ('dr-luisinho','well-macedo') THEN 'vazio_confirmado' ELSE 'encontrado' END,
         CASE WHEN c.slug='rico-pinheiro' THEN 3 WHEN c.slug='ruth-reis' THEN 11 ELSE 0 END,
         'Patrimonio eleitoral de 2026 reconciliado por SQ_CANDIDATO contra o pacote oficial completo.',
         'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip',
         'migration:20260906153000:'||c.slug,'escrita'
  FROM public.candidatos c
  WHERE c.slug IN ('rico-pinheiro','ruth-reis','dr-luisinho','well-macedo');
END
$apply$;

COMMIT;
