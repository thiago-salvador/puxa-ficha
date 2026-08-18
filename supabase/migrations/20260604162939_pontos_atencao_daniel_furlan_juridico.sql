-- Pontos de atencao juridicos verificados (governadores), aprovados para
-- publicacao antes do lancamento. Mesma disciplina do processo do Ciro: cada
-- caso verificado em multiplas fontes independentes e redacao com STATUS
-- PROCESSUAL EXATO (presuncao de inocencia: denuncia/investigacao != condenacao).
-- categoria processo_grave, visivel=true, verificado=true, gerado_por=curadoria.
-- Idempotente via NOT EXISTS por candidato_id + titulo.
BEGIN;

-- Dr. Daniel Santos (PA) — ja tinha 1 processo criminal cru (em_andamento) no
-- site; este ponto de atencao surfa o caso com contexto e fontes.
INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'dcc4a93e-4114-43e9-b067-4581ed12cfd5',
  'processo_grave',
  'Reu por corrupcao e lavagem; afastamento suspenso pelo STJ',
  'Denunciado pelo Ministerio Publico do Para por corrupcao, fraude em licitacoes, lavagem de dinheiro e organizacao criminosa, em apuracao sobre contratos de mais de R$ 100 milhoes da prefeitura de Ananindeua (operacoes Aqueronte e Hades). O TJ-PA chegou a determinar seu afastamento cautelar do cargo, mas o STJ suspendeu a decisao via habeas corpus e ele retornou a prefeitura. Responde a acao, sem condenacao ate o momento.',
  '[{"url":"https://www.oliberal.com/ananindeua/ananindeua-mppa-apresenta-denuncia-contra-o-prefeito-daniel-santos-por-crimes-de-corrupcao-1.1029475","data":"2026-05-16","titulo":"MPPA apresenta denuncia contra Daniel Santos por crimes de corrupcao (O Liberal)"},{"url":"https://www.cnnbrasil.com.br/politica/pa-bens-de-r-19-milhoes-de-prefeito-de-ananindeua-sao-alvo-de-operacao/","data":"2026-05","titulo":"Bens de R$ 19 mi de prefeito de Ananindeua sao alvo de operacao (CNN Brasil)"}]'::jsonb,
  'alta', true, 'curadoria', true, '2026-05-16'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = 'dcc4a93e-4114-43e9-b067-4581ed12cfd5'
    AND categoria = 'processo_grave'
    AND titulo = 'Reu por corrupcao e lavagem; afastamento suspenso pelo STJ'
);

-- Dr. Furlan (AP) — nao tinha nenhum registro juridico no site.
INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '9f2c557f-7c5a-459b-b0f5-faa6d561a4ce',
  'processo_grave',
  'Investigado pela PF por milicia digital (R$ 25 mi); sem condenacao',
  'Alvo da Operacao Palanque Digital da Policia Federal em 26/05/2026, que investiga suposto desvio de cerca de R$ 25 milhoes em contratos de publicidade da prefeitura de Macapa para operar uma milicia digital de desinformacao e ataques a adversarios, com uso de IA para deepfakes. A PF cumpriu 35 mandados de busca e apreensao e apura crimes eleitorais, contra a administracao publica, organizacao criminosa e lavagem. Ja havia sido afastado da prefeitura em marco por outra operacao. Investigacao em curso, sem denuncia formal nem condenacao.',
  '[{"url":"https://agenciabrasil.ebc.com.br/radioagencia-nacional/seguranca/audio/2026-05/ex-prefeito-de-macapa-dr-furlan-e-alvo-de-operacao-da-policia-federal","data":"2026-05-26","titulo":"Ex-prefeito de Macapa Dr. Furlan e alvo de operacao da PF (Agencia Brasil)"},{"url":"https://www.poder360.com.br/poder-seguranca-publica/pf-investiga-ex-prefeito-de-macapa-por-desvio-de-r-25-mi/","data":"2026-05-26","titulo":"PF investiga ex-prefeito de Macapa por desvio de R$ 25 mi (Poder360)"}]'::jsonb,
  'alta', true, 'curadoria', true, '2026-05-26'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pontos_atencao
  WHERE candidato_id = '9f2c557f-7c5a-459b-b0f5-faa6d561a4ce'
    AND categoria = 'processo_grave'
    AND titulo = 'Investigado pela PF por milicia digital (R$ 25 mi); sem condenacao'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM public.pontos_atencao
  WHERE categoria = 'processo_grave' AND visivel = true
    AND candidato_id IN ('dcc4a93e-4114-43e9-b067-4581ed12cfd5','9f2c557f-7c5a-459b-b0f5-faa6d561a4ce')
    AND data_referencia IN ('2026-05-16','2026-05-26');
  IF n <> 2 THEN
    RAISE EXCEPTION 'pontos juridicos daniel/furlan: esperado 2 visiveis, encontrado %', n;
  END IF;
END $$;

COMMIT;
