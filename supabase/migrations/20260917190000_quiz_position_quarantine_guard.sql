-- Quarentena nominal de posições do quiz sem suporte suficiente.
-- A tabela é a autoridade de bloqueio: qualquer INSERT/UPDATE que tente
-- reativar uma tupla enquanto ela estiver ativa permanece verificado=false.
CREATE TABLE IF NOT EXISTS public.quiz_position_quarantine (
  candidato_id uuid NOT NULL,
  tema text NOT NULL,
  posicao text NOT NULL CHECK (posicao IN ('a_favor', 'contra', 'ambiguo')),
  url_fonte text NOT NULL,
  motivo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidato_id, tema, url_fonte, posicao)
);

ALTER TABLE public.quiz_position_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quiz_position_quarantine FROM anon, authenticated;
GRANT ALL ON public.quiz_position_quarantine TO service_role;

COMMENT ON TABLE public.quiz_position_quarantine IS
  'Tuplas nominais cuja verificado=true foi bloqueada por auditoria do quiz; remover uma linha exige revisão de fonte.';

INSERT INTO public.quiz_position_quarantine (candidato_id, tema, posicao, url_fonte, motivo)
SELECT alvo.candidato_id::uuid, alvo.tema, alvo.posicao, alvo.url_fonte, alvo.motivo
FROM (VALUES
  ('4e3828f3-33c9-4206-9aff-7b869a466baa', 'reforma_trabalhista', 'a_favor', 'https://www.congressonacional.leg.br/materias/medidas-provisorias/-/mpv/148214/votacoes', 'MPV 1045/2021/minirreforma é proxy da Lei 13.467/2017; voto individual não foi extraído.'),
  ('4e3828f3-33c9-4206-9aff-7b869a466baa', 'teto_gastos', 'contra', 'https://www25.senado.leg.br/web/atividade/materias/-/materia/155594/votacoes', 'PEC da Transição de 2022 não é a votação da EC 95/2016; conferência nominal insuficiente.'),
  ('81e00cd6-ea5b-4c19-8bff-a116fb73e5a7', 'previdencia', 'a_favor', 'https://sindpolalagoas.com.br/noticia/texto-da-reforma-da-previdencia-de-renan-filho-deve-parar-na-justica/', 'Reforma previdenciária estadual de Alagoas não prova apoio à reforma federal de 2019.'),
  ('81e00cd6-ea5b-4c19-8bff-a116fb73e5a7', 'reforma_trabalhista', 'contra', 'https://www.cadaminuto.com.br/noticia/2026/05/29/trabalhador-tem-direito-de-viver-com-a-familia-diz-renan-filho-sobre-fim-da-escala-6x1', 'Apoio ao fim da escala 6x1 em 2026 não comprova rejeição da reforma de 2017 inteira.'),
  ('edddfd43-0528-41eb-977a-feacdbbbe8fc', 'previdencia', 'a_favor', 'https://www.cmm.am.gov.br/foram-extremamente-crueis-com-os-servidores-publicos-municipais-diz-rodrigo-guedes-sobre-os-vereadores-que-aprovaram-a-reforma-da-previdencia-municipal-de-manaus/', 'Reforma municipal de Manaus de 2025 não é a reforma federal de 2019.'),
  ('9fe469dc-058f-487d-b888-ba113f5535ae', 'teto_gastos', 'a_favor', 'https://www.infomoney.com.br/politica/arcabouco-fiscal-omar-aziz-apresenta-relatorio-com-3-excecoes-ao-limite-de-despesas/', 'Relatoria do arcabouço de 2023 não sustenta a posição no teto de 2016.'),
  ('1d083d19-96c3-4a41-9d75-6abffacc4a3a', 'previdencia', 'a_favor', 'https://www.cms.ba.gov.br/noticias/prefeito-apresentou-a-vereadores-a-reforma-da-previdencia', 'Reforma municipal de Salvador de 2020 não é a reforma federal de 2019.'),
  ('3b724874-8769-44f3-aab3-06c0155dc155', 'privatizacao_eletrobras', 'contra', 'https://www.cl.df.gov.br/-/lancada-frente-parlamentar-em-defesa-das-estatais-do-df', 'Defesa de estatais do DF não demonstra posição específica sobre a Eletrobras.'),
  ('17472d91-6cfc-453d-8481-4fac47d07f36', 'teto_gastos', 'a_favor', 'https://www.camara.leg.br/deputados/204377/votacoes-nominais-plenario/2021', 'PEC Emergencial de 2021 foi usada como proxy do teto de 2016; voto não foi extraído.'),
  ('a342036a-c436-400a-bd14-edefacad8d75', 'previdencia', 'contra', 'https://portal.al.go.leg.br/noticias/82943/pacto-de-ajuste', 'Ajuste estadual goiano de 2016 não é a reforma federal de 2019.'),
  ('a342036a-c436-400a-bd14-edefacad8d75', 'privatizacao_eletrobras', 'contra', 'https://portal.al.go.leg.br/noticias-dos-gabinetes/3016/luis-cesar-bueno-fala-em-nome-da-oposicao-veja-o-discurso-completo', 'Discurso sobre patrimônio estadual goiano não é posição específica sobre a Eletrobras.'),
  ('ff7f433f-70b4-420c-885d-c0401a901790', 'reforma_trabalhista', 'contra', 'https://www12.senado.leg.br/noticias/materias/2026/05/27/cleitinho-defende-fim-da-escala-6x1-e-critica-privilegios-da-classe-politica', 'Título sobre escala 6x1 não certifica posição sobre a reforma de 2017 inteira.'),
  ('f383d692-5872-444d-b107-794c00182bad', 'transferencia_renda', 'a_favor', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MG/20322002026/candidato/130002552308', 'TSE retornou HTTP 403; o bloqueio não refuta o programa citado.'),
  ('6e37f628-6335-4009-8e49-80aa421650a0', 'privatizacao_eletrobras', 'a_favor', 'https://www.diariodoaco.com.br/noticia/0129175-em-ipatinga-simoes-diz-que-resistencia-a-privatizacao-da-copasa-e-147minima8221-e-defende-venda-da-estatal', 'Defesa da privatização da Copasa não comprova posição sobre a Eletrobras.'),
  ('a8a86164-4000-4bbe-ac11-c02b90955ea5', 'previdencia', 'a_favor', 'https://www.hnt.com.br/politica/mt-adotou-as-medidas-necessarias-para-recuperacao-da-previdencia-diz-vice-governador/513443', 'Defesa da previdência estadual de Mato Grosso não é a reforma federal de 2019.'),
  ('8a59da03-a2ad-4385-9516-eb738f970df0', 'privatizacao_eletrobras', 'contra', 'https://psolpe50.org/ivan-moraes-e-o-unico-pre-candidato-ao-governo-de-pernambuco-contrario-a-privatizacao-do-metro-do-recife', 'Defesa do Metrô do Recife público não comprova posição específica sobre a Eletrobras.'),
  ('022d27e8-2832-4156-9bc7-7eac817ac901', 'privatizacao_eletrobras', 'a_favor', 'https://blogcenario.com.br/2026/04/29/raquel-lyra-assina-concessao-parcial-da-compesa', 'Concessão parcial da Compesa não comprova posição sobre a Eletrobras.'),
  ('e2648b98-f9a9-4487-9fdd-49609ac520d6', 'privatizacao_eletrobras', 'contra', 'https://opiniaosocialista.com.br/pre-candidato-do-pstu-denuncia-rafael-fonteles-do-pt-esta-entregando-o-piuai/', 'Crítica a empresas estaduais do Piauí não prova posição sobre a Eletrobras.'),
  ('c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'previdencia', 'a_favor', 'https://www.cut.org.br/noticias/reforma-da-previdencia-de-natal-retira-direitos-e-destroi-sonhos-dos-servidores-e45f', 'Reforma municipal de Natal de 2022 não é a reforma federal de 2019.'),
  ('c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'privatizacao_eletrobras', 'a_favor', 'https://braziljournal.com/alvaro-dias-o-centro-vai-acabar-dividido/', 'A fonte trata de Alvaro Fernandes Dias, PR, e foi atribuída ao Alvaro Costa Dias, RN.'),
  ('b01d3b26-32d0-48c3-9242-6c6b324b249d', 'privatizacao_eletrobras', 'ambiguo', 'https://www.radiocolonial.com.br/noticia%2C22497%2CA-chance-do-Banrisul-ser-privatizado-e-zero-afirma-Gabriel-Souza', 'Trecho sobre Banrisul não comprova ambiguidade sobre a Eletrobras.'),
  ('8e6f8d4c-7981-499e-b03b-5778e1db704d', 'previdencia', 'contra', 'https://www.clicksergipe.com.br/politica/4/75522/valmir-de-francisquinho-diz-que-fim-do-desconto-para-a-previdencia-e-vitoria-dos-servidores-e-da-oposicao.html', 'Crítica a desconto previdenciário em Sergipe não é posição sobre a reforma federal de 2019.'),
  ('5a4d76d2-6243-41b9-88b2-e94c68383e52', 'reforma_trabalhista', 'contra', 'https://veronoticias.com/politica/augusto-cury-critica-polarizacao-na-marcha-dos-prefeitos/', 'Fim da escala 6x1 e jornada 5x2 não provam posição sobre a reforma de 2017 inteira.'),
  ('538fb04d-8fb4-486f-a7dd-9c78399a6353', 'reforma_trabalhista', 'a_favor', 'https://agenciabrasil.ebc.com.br/politica/noticia/2026-05/flavio-bolsonaro-sugere-pagamento-por-hora-em-alternativa-escala-6x1', 'Página desativada; texto indexado não certifica o corpo completo nem a reforma de 2017.'),
  ('538fb04d-8fb4-486f-a7dd-9c78399a6353', 'teto_gastos', 'a_favor', 'https://www.congressoemfoco.com.br/noticia/9640/arcabouco-fiscal-veja-como-votou-cada-senador', 'Voto no arcabouço de 2023 não demonstra apoio ao teto de 2016.'),
  ('4cbc3b25-075a-4d87-89bd-58d1e0b2a5f2', 'reforma_trabalhista', 'a_favor', 'https://www.youtube.com/watch?v=4UdCx0QYRSk', 'Há apenas metadados do vídeo, sem transcrição ou reprodução verificável.'),
  ('032c77e4-7b2f-4076-a942-186da9f8c62b', 'privatizacao_eletrobras', 'a_favor', 'https://g1.globo.com/politica/eleicoes/2026/noticia/2026/08/11/plano-de-governo-romeu-zema-eleicoes-2026-propostas.ghtml', 'Proposta genérica de privatizar estatais não demonstra avaliação específica da Eletrobras.'),
  ('c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'transferencia_renda', 'a_favor', 'https://www12.senado.leg.br/noticias/materias/2010/04/19/alvaro-dias-diz-que-reducao-das-desigualdades-comecou-na-constituicao-de-88', 'Fonte do Senado refere-se a Alvaro Fernandes Dias, PR, homônimo do candidato do RN.')
) AS alvo(candidato_id, tema, posicao, url_fonte, motivo)
JOIN public.candidatos AS c ON c.id = alvo.candidato_id::uuid
ON CONFLICT (candidato_id, tema, url_fonte, posicao) DO UPDATE
SET motivo = EXCLUDED.motivo, ativo = true;

CREATE OR REPLACE FUNCTION public.block_quiz_position_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.verificado IS TRUE
     AND EXISTS (
       SELECT 1
       FROM public.quiz_position_quarantine AS q
       WHERE q.ativo IS TRUE
         AND q.candidato_id = NEW.candidato_id
         AND q.tema = NEW.tema
         AND q.posicao = NEW.posicao
         AND q.url_fonte = NEW.url_fonte
     ) THEN
    NEW.verificado := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_quiz_position_reactivation ON public.posicoes_declaradas;
CREATE TRIGGER trg_block_quiz_position_reactivation
BEFORE INSERT OR UPDATE OF verificado, candidato_id, tema, posicao, url_fonte
ON public.posicoes_declaradas
FOR EACH ROW
EXECUTE FUNCTION public.block_quiz_position_reactivation();
