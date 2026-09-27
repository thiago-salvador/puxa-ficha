-- Número de processo fora do padrão CNJ na ficha wilson-grassi-junior.
--
-- A linha 6d93a421-403d-401d-a6ad-a50b03970b81 (onda-p de 14/08/2026) gravou
-- numero_processo = '2254046-86.2021.8.26.0000/50000'. O sufixo "/50000" é o
-- número do incidente no e-SAJ do TJSP, não parte do número único: juntos
-- viram 25 dígitos, que nenhuma consulta por número CNJ encontra.
--
-- Fonte primária, lida em 2026-09-26:
--   e-SAJ TJSP, consulta de 2º grau por número unificado
--     https://esaj.tjsp.jus.br/cposg/search.do?cbPesquisa=NUMPROC&dePesquisaNuUnificado=2254046-86.2021.8.26.0000&tipoNuProcesso=UNIFICADO
--     processo 2254046-86.2021.8.26.0000 (Habeas Corpus Cível, 28/10/2021),
--     incidente 50000 - Agravo Regimental Cível (encerrado), 12/11/2021.
--   TJSP, comunicado do Órgão Especial citado em url_fonte
--     2254046-86.2021.8.26.0000/50000 - Agravo Regimental Cível - agravante
--     Wilson Grassi Junior - "NEGARAM PROVIMENTO AO AGRAVO INTERNO. V.U."
-- O dígito verificador (módulo 97 da Resolução CNJ 65/2008) confere: 86.
--
-- Status: a linha dizia 'em tramitacao (comunicacao publicada)'. Na mesma
-- consulta do e-SAJ, relida em 2026-09-26 (sha256 do corpo
-- 384fec73931b4d4f796d3bc873564be5bf23c091e9ed3077eb422083f1a5caed), o
-- processo aparece "Arquivado administrativamente" e o incidente 50000
-- "(Encerrado)"; o comunicado do Órgão Especial registra o agravo julgado
-- ("NEGARAM PROVIMENTO AO AGRAVO INTERNO. V.U."). O status passa a 'arquivado',
-- valor terminal já usado no vocabulário de processos.
--
-- Escrita: numero_processo -> '2254046-86.2021.8.26.0000' e status ->
-- 'arquivado'. A descrição já nomeia o incidente /50000 e continua como está.
-- A linha segue publicada.
-- A preimagem integral da linha fica no recibo em coleta_log (before/after),
-- que o rollback usa com CAS. Fail-closed: aceita somente a preimagem medida.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-processos-numero-cnj-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.processos IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  alvo uuid := '6d93a421-403d-401d-a6ad-a50b03970b81';
  preimagem jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'processo-cnj-20260926: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'processo-cnj-20260926: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.processos p
       JOIN public.candidatos c ON c.id = p.candidato_id
       WHERE p.id = alvo
         AND c.slug = 'wilson-grassi-junior'
         AND p.tribunal = 'TJSP'
         AND p.numero_processo = '2254046-86.2021.8.26.0000/50000'
         AND p.tipo = 'civil'
         AND p.descricao = 'Agravo regimental civel 2254046-86.2021.8.26.0000/50000, TJSP Orgao Especial. Wilson Grassi Junior figura como agravante; agravado: Prefeito do Municipio de Sao Paulo. Negaram provimento, unanime. Nao e acao penal.'
         AND p.status = 'em tramitacao (comunicacao publicada)'
         AND p.fonte = 'onda-p-20260814: DJEN/CNJ'
         AND p.url_fonte = 'https://www.tjsp.jus.br/OrgaoEspecial/Comunicados/Comunicado?codigoComunicado=30327&pagina=2'
         AND p.data_inicio IS NULL AND p.data_decisao IS NULL AND p.gravidade IS NULL) <> 1
  THEN
    RAISE EXCEPTION 'processo-cnj-20260926: preimagem da linha divergiu';
  END IF;

  preimagem := (SELECT to_jsonb(p) FROM public.processos p WHERE p.id = alvo);

  -- @write tabela=processos slug=wilson-grassi-junior campos=numero_processo,status
  UPDATE public.processos p
  SET numero_processo = '2254046-86.2021.8.26.0000',
      status = 'arquivado'
  WHERE p.id = alvo
    AND p.candidato_id = (SELECT c.id FROM public.candidatos c WHERE c.slug = 'wilson-grassi-junior')
    AND to_jsonb(p) = preimagem;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'processo-cnj-20260926: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260926190000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tjsp-esaj-2grau','candidato',
         'processos.numero_processo,status', p.candidato_id,
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Numero do processo de wilson-grassi-junior volta ao numero unico CNJ 2254046-86.2021.8.26.0000 (o sufixo /50000 e o incidente Agravo Regimental Civel no e-SAJ do TJSP e segue citado na descricao) e o status passa a arquivado: o e-SAJ mostra o processo arquivado administrativamente e o incidente encerrado.',
           'fontes', jsonb_build_array(
             jsonb_build_object('url','https://esaj.tjsp.jus.br/cposg/search.do?cbPesquisa=NUMPROC&dePesquisaNuUnificado=2254046-86.2021.8.26.0000&tipoNuProcesso=UNIFICADO','lido_em','2026-09-26','sha256','384fec73931b4d4f796d3bc873564be5bf23c091e9ed3077eb422083f1a5caed','achado','Habeas Corpus Civel 2254046-86.2021.8.26.0000 arquivado administrativamente; incidente 50000 Agravo Regimental Civel encerrado'),
             jsonb_build_object('url','https://www.tjsp.jus.br/OrgaoEspecial/Comunicados/Comunicado?codigoComunicado=30327&pagina=2','lido_em','2026-09-26','achado','2254046-86.2021.8.26.0000/50000 Agravo Regimental Civel, agravante Wilson Grassi Junior')),
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', c.slug,
             'id', p.id,
             'before', preimagem,
             'after', to_jsonb(p)) ORDER BY p.id)
         )::text,
         'https://esaj.tjsp.jus.br/cposg/search.do?cbPesquisa=NUMPROC&dePesquisaNuUnificado=2254046-86.2021.8.26.0000&tipoNuProcesso=UNIFICADO',
         'migration:20260926190000','escrita'
  FROM public.processos p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.id = alvo
  GROUP BY p.candidato_id;

  IF (SELECT count(*) FROM public.processos p
       WHERE p.id = alvo
         AND p.numero_processo = '2254046-86.2021.8.26.0000'
         AND p.status = 'arquivado') <> 1
  THEN
    RAISE EXCEPTION 'processo-cnj-20260926: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
