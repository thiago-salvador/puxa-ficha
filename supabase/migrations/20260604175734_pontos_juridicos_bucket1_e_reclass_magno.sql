-- Acao editorial pos deep-research de transparencia (2026-06-04), aprovada.
-- Bucket 1: publica pontos de atencao juridicos status-precisos (presuncao de
-- inocencia) para 3 governadores ja publicados, com redacoes verificadas em
-- fontes primarias (CartaCapital, Gazeta do Povo, Senado, Agencia Brasil, CNN).
-- Rafaell Milas NAO entra (mera representacao civel sem decisao).
-- Bucket 2: Magno Malta nunca lancou pre-candidatura formal a governador (apenas
-- "cotado" pelo PL); despublicado como pre-candidato a governador (reversivel).
-- categoria processo_grave, verificado=true, gerado_por=curadoria. Idempotente.
BEGIN;

-- 1) David Almeida (AM) — inquerito PF, sem denuncia/condenacao
INSERT INTO public.pontos_atencao (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT 'edddfd43-0528-41eb-977a-feacdbbbe8fc','processo_grave',
  'Alvo de inquerito da PF (suposta compra de votos 2024); sem denuncia nem condenacao',
  'David Almeida e alvo de inquerito da Policia Federal, aberto em 2024, que apura suposta compra de votos na campanha municipal de 2024 em Manaus. Em marco de 2026, um laudo pericial citou seu genro como suposto intermediario. Trata-se de investigacao em andamento: nao ha denuncia aceita, processo como reu, condenacao nem qualquer decisao de inelegibilidade. Vale a presuncao de inocencia.',
  '[{"url":"https://www.riosdenoticias.com.br/urgente-genro-de-david-almeida-envolvido-em-suposta-compra-de-votos-nas-eleicoes-aponta-pf/","data":"2026-03-13","titulo":"PF aponta genro de David Almeida em suposta compra de votos (Rios de Noticias)"}]'::jsonb,
  'media', true, 'curadoria', true, '2026-03-13'
WHERE NOT EXISTS (SELECT 1 FROM public.pontos_atencao WHERE candidato_id='edddfd43-0528-41eb-977a-feacdbbbe8fc' AND categoria='processo_grave');

-- 2) Jose Roberto Arruda (DF) — condenacao improbidade + elegibilidade em aberto
INSERT INTO public.pontos_atencao (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT 'd9cf9c6b-c6f9-4561-ab0f-138d2086c5ce','processo_grave',
  'Condenado por improbidade (Caixa de Pandora); elegibilidade indefinida ate o registro',
  'Jose Roberto Arruda foi condenado por improbidade administrativa (caso Caixa de Pandora), o que, pelas regras anteriores, geraria inelegibilidade. Ele sustenta estar elegivel por forca de mudanca na Lei da Ficha Limpa (LC 219/2025), cujo julgamento no STF esta suspenso. Nao ha definicao: sua elegibilidade so sera decidida pela Justica Eleitoral no momento do registro da candidatura, ate 15/08/2026.',
  '[{"url":"https://jornalcapitalfederal.com.br/2025/12/01/arruda-pode-concorrer-a-eleicao-pre-candidatura-expoe-incertezas-sobre-sua-elegibilidade-em-2026/","data":"2025-12-01","titulo":"Pre-candidatura de Arruda expoe incertezas sobre elegibilidade (Jornal Capital Federal)"}]'::jsonb,
  'alta', true, 'curadoria', true, '2026-06-04'
WHERE NOT EXISTS (SELECT 1 FROM public.pontos_atencao WHERE candidato_id='d9cf9c6b-c6f9-4561-ab0f-138d2086c5ce' AND categoria='processo_grave');

-- 3) Sergio Moro (PR) — reu no STF, sem condenacao
INSERT INTO public.pontos_atencao (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT '6025cfb5-d1a7-4ad0-baa7-c131b381e8fa','processo_grave',
  'Reu no STF por suposta calunia contra Gilmar Mendes; sem condenacao',
  'Sergio Moro e reu em acao penal no STF por suposta calunia contra o ministro Gilmar Mendes, referente a uma declaracao de 2023. Em marco de 2026, a 1a Turma rejeitou seus recursos e manteve o processo, que esta em fase de instrucao. Nao ha condenacao nem qualquer decisao de inelegibilidade; vale a presuncao de inocencia.',
  '[{"url":"https://www.cartacapital.com.br/politica/com-voto-de-fux-stf-mantem-moro-reu-por-calunia-contra-gilmar/","data":"2026-03-13","titulo":"STF mantem Moro reu por calunia contra Gilmar (CartaCapital)"}]'::jsonb,
  'media', true, 'curadoria', true, '2026-03-13'
WHERE NOT EXISTS (SELECT 1 FROM public.pontos_atencao WHERE candidato_id='6025cfb5-d1a7-4ad0-baa7-c131b381e8fa' AND categoria='processo_grave');

-- Bucket 2: Magno Malta (ES) nunca lancou pre-candidatura formal (apenas cotado)
UPDATE public.candidatos
SET publicavel = false, ultima_atualizacao = NOW()
WHERE slug = 'magno-malta' AND cargo_disputado = 'Governador';

DO $$
DECLARE n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM public.pontos_atencao WHERE categoria='processo_grave' AND visivel=true
    AND candidato_id IN ('edddfd43-0528-41eb-977a-feacdbbbe8fc','d9cf9c6b-c6f9-4561-ab0f-138d2086c5ce','6025cfb5-d1a7-4ad0-baa7-c131b381e8fa');
  IF n <> 3 THEN RAISE EXCEPTION 'esperado 3 pontos juridicos bucket1, encontrado %', n; END IF;
  SELECT COUNT(*) INTO n FROM public.candidatos_publico WHERE slug='magno-malta';
  IF n <> 0 THEN RAISE EXCEPTION 'magno-malta deveria estar despublicado'; END IF;
END $$;

COMMIT;
