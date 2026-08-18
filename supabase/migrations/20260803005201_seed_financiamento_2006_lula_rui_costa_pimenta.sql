-- =====================================================================
-- Financiamento de campanha 2006: lula e rui-costa-pimenta.
-- Branch data/presidenciaveis-lacunas (2026-08-02). Fecha 2 dos 10 pares
-- (slug, ano) do mapa de lacunas dos 11 pre-candidatos a Presidencia.
--
-- FONTE (varredura read-only, 2026-08-02)
-- Pacote oficial do TSE:
--   https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_contas_2006.zip
--   membro prestacao_contas_2006/2006/Candidato/Receita/ReceitaCandidato.csv
--   (layout legado 2006: SEQUENCIAL_CANDIDATO, VALOR_RECEITA, TIPO_RECEITA,
--    NOME_DOADOR, NUMERO_CPF_CGC_DOADOR; separador ';', encoding latin-1).
--
-- IDENTIDADE DO CANDIDATO
-- O layout de 2006 usa SEQUENCIAL_CANDIDATO, nao SQ_CANDIDATO. Os dois valores
-- foram confirmados em consulta_cand_2006_BR.csv (mesmo portal, cache local
-- .tse-audit-cache/2006/), casando nome completo, cargo e partido:
--   lula              -> SEQUENCIAL 23, "LUIZ INACIO LULA DA SILVA", PRESIDENTE, PT, APTO
--   rui-costa-pimenta -> SEQUENCIAL 27, "RUI COSTA PIMENTA", PRESIDENTE, PCO, INAPTO/INDEFERIDO
-- O SEQUENCIAL 27 ja constava em data/candidatos.json (ids.tse_sq_candidato.2006);
-- o 23 do Lula nao constava no seed e foi descoberto nesta varredura.
-- O filtro aplicado foi SEQUENCIAL_CANDIDATO + DESCRICAO_CARGO = 'Presidente',
-- porque sequenciais de 2006 sao numeros curtos e se repetem entre unidades
-- eleitorais; sem o filtro de cargo haveria homonimo numerico.
--
-- AGREGACAO (mesma semantica do ingest do repo, adaptada ao layout de 2006)
--   total_arrecadado       = soma de VALOR_RECEITA de todas as linhas do candidato
--   total_fundo_partidario = TIPO_RECEITA 'RECURSOS DE PARTIDO POLITICO'
--   total_pessoa_fisica    = TIPO_RECEITA 'RECURSOS DE PESSOAS FISICAS'
--   total_recursos_proprios= TIPO_RECEITA de recursos proprios (zero nos dois casos)
--   total_fundo_eleitoral  = 0 por construcao: o FEFC so existe a partir de 2017
--   maiores_doadores       = top 10 por src/lib/financiamento-public.ts
--                            (normalizeMaioresDoadoresForStorage), agregando por
--                            nome normalizado; tipo do doador vem do documento
--                            (11 digitos = PF, 14 = PJ) e, sem documento, da
--                            rubrica, com o mesmo default 'PJ' do ingest 2018+.
--   CNPJ so e gravado quando o documento tem exatamente 14 digitos. Nenhum CPF
--   entra, nem em claro nem em hash: o pacote de 2006 traz CPF em claro e este
--   run nao usa PF_DOADOR_CPF_HASH_SALT.
--
-- LINHAS DE ORIGEM: lula 1634, rui-costa-pimenta 2.
-- No caso do Lula, as 990 linhas 'DESCRICAO DAS DOACOES RELATIVAS A
-- COMERCIALIZACAO' sao o detalhamento das 3 linhas-cabecalho
-- 'COMERCIALIZACAO DE BENS OU REALIZACAO DE EVENTOS', que vem com
-- VALOR_RECEITA vazio; somar as duas rubricas nao duplica valor.
--
-- ESCOPO: so INSERT em public.financiamento para estes 2 pares. Nenhuma outra
-- tabela, nenhum outro candidato, nenhum UPDATE.
-- =====================================================================
--
-- ---------------------------------------------------------------------
-- REGISTRO DE APLICACAO (cabecalho que veio junto com a versao as-applied):
-- Financiamento de campanha 2006: lula e rui-costa-pimenta.
-- Fonte: cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_contas_2006.zip
-- membro prestacao_contas_2006/2006/Candidato/Receita/ReceitaCandidato.csv (layout legado).
-- Identidade confirmada em consulta_cand_2006_BR.csv: lula SEQUENCIAL 23, rui-costa-pimenta 27,
-- filtrando tambem DESCRICAO_CARGO = 'Presidente'. Detalhe completo em
-- supabase/migrations/20260802120000_seed_financiamento_2006_lula_rui_costa_pimenta.sql
--
-- PROVENIENCIA (03/08/2026). Este arquivo e a versao as-applied, recuperada
-- por `supabase migration fetch`, e e o nome que o ledger de producao conhece.
-- O raciocinio acima foi portado de 20260802120000_seed_financiamento_2006_lula_rui_costa_pimenta.sql,
-- escrita a mao e deixada em branch nao mergeada. O SQL das duas e identico,
-- conferido por comparacao normalizada. So comentario mudou aqui.
-- ---------------------------------------------------------------------

INSERT INTO public.financiamento (
  candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
  total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
  maiores_doadores, fonte
)
SELECT c.id, 2006,
       81188298.01, 13850429.29,
       0.00, 159362.75,
       0.00,
       '[{"nome": "COMITÊ FINANCEIRO NACIONAL PARA PRESIDENTE DA REPÚBLICA PT-DF", "valor": 51355307.57, "tipo": "PJ"}, {"nome": "DIRETÓRIO NACIONAL PT-BR", "valor": 11505187.3, "tipo": "fundo_partidario"}, {"nome": "COMITÊ FINANCEIRO NACIONAL PARA PRESIDENTE DA REPÚBLICA PT-BR", "valor": 9950000, "tipo": "PJ"}, {"nome": "COMITÊ FINANCEIRO NACIONAL PARA PRESIDENTE DA REPÚBLICA PT-", "valor": 1650000, "tipo": "PJ"}, {"nome": "COMITÊ FINANCEIRO ÚNICO PT-DF", "valor": 1483375.64, "tipo": "PJ", "cnpj": "08142719000179"}, {"nome": "DIRETÓRIO REGIONAL PT-SP", "valor": 1002421.46, "tipo": "fundo_partidario"}, {"nome": "CARIOCA CHRISTIANI NIELSEN ENGENHARIA S A", "valor": 500000, "tipo": "PJ", "cnpj": "40450769000126"}, {"nome": "JAQUES WAGNER 13-BA", "valor": 420806, "tipo": "PJ"}, {"nome": "DIRETÓRIO REGIONAL PT-MG", "valor": 291068.82, "tipo": "fundo_partidario"}, {"nome": "DIRETÓRIO REGIONAL PT-PR", "valor": 287059.87, "tipo": "fundo_partidario"}]'::jsonb,
       'TSE'
FROM public.candidatos c
WHERE c.slug = 'lula'
  AND NOT EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.candidato_id = c.id AND f.ano_eleicao = 2006
  );

INSERT INTO public.financiamento (
  candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
  total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
  maiores_doadores, fonte
)
SELECT c.id, 2006,
       11000.00, 11000.00,
       0.00, 0.00,
       0.00,
       '[{"nome": "DIRETÓRIO NACIONAL PCO-BR", "valor": 11000, "tipo": "fundo_partidario"}]'::jsonb,
       'TSE'
FROM public.candidatos c
WHERE c.slug = 'rui-costa-pimenta'
  AND NOT EXISTS (
    SELECT 1 FROM public.financiamento f
    WHERE f.candidato_id = c.id AND f.ano_eleicao = 2006
  );;
