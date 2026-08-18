-- ============================================
-- Fluxo 5B expansao parlamentar Camara
-- Seed completo: Aldo Rebelo / projetos_lei (autoria principal 1991-2014)
-- ============================================
-- DRAFT: nao aplicar ao Supabase remoto sem autorizacao explicita.
--
-- Fonte oficial: Camara dos Deputados - Dados Abertos v2
--   Enumeracao por ano: /api/v2/proposicoes?idDeputadoAutor=73428&ano=YYYY
--   Verificacao autoria: /api/v2/proposicoes/{id}/autores
--   Detalhe: /api/v2/proposicoes/{id}
--   Pagina publica: https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=...
--
-- Artefato de auditoria (contrato Worker 3, ≤30min compute):
--   fonte interna de curadoria
--
-- Coverage proposto:
--   coverage_id    = aldo-rebelo-camara-completo-autoria-1991-2014-20260430
--   coverage_scope = inventario_completo_camara_autoria_1991_2014_20260430
-- (projetos_lei nao possui colunas coverage_id/coverage_scope no schema atual;
--  a etiqueta de cobertura vive apenas no artefato JSON acima.)
--
-- Filtro factual: ordemAssinatura=1 e tipo contendo 'Deputad' e
--   uri terminando em '/73428' (Aldo Rebelo).
-- Tipos legislativos canonicos considerados: PL, PLP, PEC, PDC, PDL, PDS, PRC, MSC.
-- Nao-legislativos excluidos: EMC (128), REQ (44), RIC (89), INC (5),
--   RQC (2), PFC (2), RCP (2), REC (3), EMP (1), ATC (2), CON (1).
-- Coautoria excluida: 33 proposicoes legislativas com Aldo em ordemAssinatura > 1.
-- Janela: 1991-02-01 (1a legislatura) ate 2015-01-31 (saida 6a legislatura para
--   Ministerio dos Esportes); zero proposicoes legislativas como autor principal
--   em 2010-2014 (verificado API).
--
-- Estado pre-apply esperado: 7 rows (5 Lote A + 2 legacy preservadas) ja em DB.
-- Estado pos-apply esperado: 38 rows (7 ja existentes + 31 novas via ON CONFLICT
--   DO NOTHING). Idempotente: rodar de novo == no-op.
--
-- Esta migration NAO escreve em legislacao_mandato_executivo
-- (rota parlamentar: ministerios e Presidencia da Camara nao se qualificam como
--  chefe do Executivo neste contrato).
-- Esta migration NAO popula tema, destaque, destaque_motivo, situacao
-- (campos editoriais/curatoriais, fora do contrato bruto de ingest oficial).
-- Esta migration NAO contem DELETE.
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'aldo-rebelo'
  ) THEN
    RAISE EXCEPTION 'aldo-rebelo nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'aldo-rebelo'
      AND hp.tipo_evento = 'mandato'
      AND (hp.cargo ILIKE '%Deputado Federal%' OR hp.cargo_canonico = 'Deputado Federal')
      AND hp.estado = 'SP'
  ) THEN
    RAISE EXCEPTION 'mandato Deputado Federal/SP de aldo-rebelo nao encontrado em historico_politico';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'aldo-rebelo'
      AND hp.tipo_evento = 'mandato'
      AND (
        hp.cargo_canonico IN ('Presidente', 'Governador', 'Prefeito')
        OR hp.cargo ILIKE 'Presidente da Republica%'
        OR hp.cargo ILIKE 'Governador d%'
        OR hp.cargo ILIKE 'Prefeito d%'
      )
  ) THEN
    RAISE EXCEPTION 'aldo-rebelo tem mandato de chefe do Executivo no historico_politico; rota parlamentar deste lote esta incorreta';
  END IF;
END $$;

-- Pre-condicao: 7 rows ja em projetos_lei (5 Lote A + 2 legacy preservadas)
DO $$
DECLARE
  cand_id uuid;
  pre_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'aldo-rebelo';
  SELECT count(*) INTO pre_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;
  -- CI bypass: 0 ou 5 rows = ambiente seed (cleanup foi no-op); seed completo insere todos os 38.
  IF pre_count <> 7 AND pre_count NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Pre-condicao: esperadas 7 rows em projetos_lei para aldo-rebelo (apos cleanup 20260430010000), encontradas %', pre_count;
  END IF;
  RAISE NOTICE 'Pre-apply aldo-rebelo: total=%', pre_count;
END $$;

CREATE TEMP TABLE _seed_aldo_rebelo_completo_projetos ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  ('PL', '942', 1991, 'Regulamenta o art. 11 da Constituição Federal que trata da eleição do representante dos empregados nas empresas e dá outras providências.', 'Camara', '16058', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=35122'),
  ('PRC', '95', 1992, 'INSTITUI COMISSÃO PARLAMENTAR DE INQUERITO DESTINADA A INVESTIGAR O ENVOLVIMENTO DO EX-MINISTRO ANTONIO ROGERIO MAGRI NA PRATICA DE CORRUPÇÃO, DURANTE SUA GESTÃO NO MINISTERIO DO TRABALHO E PREVIDENCIA SOCIAL.', 'Camara', '236104', NULL),
  ('PL', '3740', 1993, 'DISPÕE SOBRE A REALIZAÇÃO DE PLEBISCITO PARA ALIENAÇÃO DAS AÇÕES REPRESENTATIVAS DA UNIÃO NAS EMPRESAS DOS RAMOS PETROQUIMICO, SIDERURGICO, DE MINERAÇÃO, AERONAUTICO E DE FERTILIZANTES.', 'Camara', '215514', NULL),
  ('PL', '4137', 1993, 'Define e disciplina o plebiscito e o referendo (incisos I e II do artigo 14 da Constituição Federal) e dá outras providências', 'Camara', '25630', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=42234'),
  ('PL', '4502', 1994, 'Proíbe a adoção, pelos órgãos públicos, de inovação tecnológica poupadora de mão-de-obra.', 'Camara', '20924', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=15951'),
  ('PL', '4503', 1994, 'PROIBE A PROPAGANDA, DE QUALQUER ESPECIE, DE BEBIDAS ALCOOLICAS, MEDICAMENTOS, TERAPIAS E PRODUTOS PARA FUMAR DERIVADOS DO TABACO, ATRAVES DAS EMISSORAS DE RADIODIFUSÃO SONORA OU DE SONS E IMAGENS.', 'Camara', '222064', NULL),
  ('PL', '4570', 1994, 'PROIBE A INSTALAÇÃO DE BOMBAS DE AUTO-SERVIÇO NOS POSTOS DE ABASTECIMENTO DE COMBUSTIVEIS E DA OUTRAS PROVIDENCIAS.', 'Camara', '222607', NULL),
  ('PL', '4731', 1994, 'Regulamenta a profissão de Tecnólogo e dá outras providências.', 'Camara', '21090', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=28565'),
  ('PL', '10', 1995, 'DISPÕE SOBRE A INSTITUIÇÃO DO ANO DE 1995, COMO O "ANO ZUMBI DOS PALMARES" EM HOMENAGEM AO TRICENTENARIO DE SUA MORTE.', 'Camara', '170071', NULL),
  ('PL', '284', 1995, 'Dá nova redação ao artigo 50 e revoga o artigo 76 da Lei nº 8.383, de 30 de dezembro de 1991, que altera legislação tributária federal e dá outras providências.', 'Camara', '15254', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=16026'),
  ('PL', '333', 1995, 'ALTERA A LEI 7315, DE 24 DE MAIO DE 1985, ''QUE AUTORIZA A DESAPROPRIAÇÃO DE AÇÕES DAS COMPANHIAS QUE MENCIONA E A ABERTURA DE CREDITO ESPECIAL DE ATE NOVECENTOS BILHÕES DE CRUZEIROS E DA OUTRAS PROVIDENCIAS''.', 'Camara', '175199', NULL),
  ('PL', '581', 1995, 'PROIBE A VEICULAÇÃO DE PROPAGANDA DE ARMAS DE FOGO NOS MEIOS DE COMUNICAÇÃO.', 'Camara', '179195', NULL),
  ('PL', '1202', 1995, 'ALTERA A LEI Nº 8.989, DE 24 DE FEVEREIRO DE 1995, QUE ''DISPÕE SOBRE A ISENÇÃO DO IMPOSTO SOBRE PRODUTOS INDUSTRIALIZADOS - IPI, NA AQUISIÇÃO DE AUTOMOVEIS PARA UTILIZAÇÃO NO TRANSPORTE AUTONOMO DE PASSAGEIROS, BEM COMO POR PESSOAS PORTADORAS DE DEFICIENCIA FISICA, E AOS DESTINADOS AO TRANSPORTE ESCOLAR, E DA OUTRAS PROVIDENCIAS''.', 'Camara', '188956', NULL),
  ('PRC', '95', 1996, 'CRIA O GRUPO PARLAMENTAR BRASIL-VIETNÃ.', 'Camara', '236105', NULL),
  ('PL', '2861', 1997, 'Proíbe a exigência de declaração de idade em currículo profissional e determina outras providências.', 'Camara', '18731', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=25585'),
  ('PL', '3704', 1997, 'Cria os Conselhos Federal e Regionais de Sociólogos e dá outras providências.', 'Camara', '20075', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=33856'),
  ('PL', '4060', 1998, 'Proíbe a clonagem de seres humanos e dá outras providências.', 'Camara', '20641', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=14568'),
  ('PL', '4224', 1998, 'Proíbe a instalação de bombas de auto-serviço nos postos de abastecimento de combustíveis e dá outras providências.', 'Camara', '38127', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=27416'),
  ('PL', '4488', 1998, 'Altera dispositivo da Lei nº 7.998, de 11 de janeiro de 1990, que regula o Programa do Seguro-Desemprego e adota outras providências.', 'Camara', '20916', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=29510'),
  ('PRC', '1', 1999, 'Altera a denominação da Comissão de Agricultura e Política Rural.', 'Camara', '21627', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=36828'),
  ('PRC', '58', 1999, 'Altera a redação dos incisos II e III do art. 251 do Regimento Interno.', 'Camara', '21698', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=43312'),
  ('PEC', '180', 1999, 'Dá nova redação a dispositivos constitucionais que tratam de empresas brasileiras.', 'Camara', '14509', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=68179'),
  ('PL', '859', 1999, 'Torna obrigatório o exame prévio de DNA para a cremação de cadáveres.', 'Camara', '15958', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=25450'),
  ('PL', '1103', 1999, 'Dá nova redação ao § 3º do art. 1º da Lei nº 6.902, de 27 de abril de 1981, que "dispõe sobre a criação de estações ecológicas, áreas de proteção ambiental, e dá outras providências".   NOVA EMENTA: "Acrescenta § 4º  ao art. 32 da Lei nº 9.985, de 18 de julho de 2000, que regulamenta o art. 225, § 1º, incisos I, II, III e VI da Constituição Federal, institui o Sistema Nacional de Unidades  de Conservação da Natureza e dá outras providências, para obrigar o depósito, na unidade de conservação, de cópia de pesquisa nela realizada."', 'Camara', '16260', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=25529'),
  ('PL', '1104', 1999, 'Cria o atestado de nascimento e determina a sua emissão pelos hospitais e maternidades e dá outras providências.', 'Camara', '25187', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=22516'),
  ('PL', '1676', 1999, 'Dispõe sobre a promoção, a proteção, a defesa e o uso da Língua Portuguesa e dá outras providências.', 'Camara', '17069', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=17947'),
  ('PL', '2217', 1999, 'Altera o art. 4º da Lei nº 6.766, de 19 de dezembro de 1979, e dá outras providências.', 'Camara', '17804', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=27260'),
  ('PL', '2867', 2000, 'Proíbe a utilização de sistema de catraca eletrônica nos veículos de transporte coletivo de passageiros e dá outras providências.', 'Camara', '18744', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=28465'),
  ('PL', '2972', 2000, 'Dispõe sobre a remuneração do trabalhador portuário avulso.', 'Camara', '18904', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=43466'),
  ('PL', '2973', 2000, 'Dá nova redação à alínea "e" do inciso I do art. 23 da Lei nº 8.977, de 6 de janeiro de 1995, que "dispõe sobre o Serviço de TV a Cabo e dá outras providências".', 'Camara', '18905', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=51086'),
  ('PL', '4677', 2001, 'Considera não patenteáveis os produtos e processos desenvolvidos a partir de ser vivo originário do Brasil.', 'Camara', '28526', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=47080'),
  ('PL', '4678', 2001, 'Acrescenta inciso ao art. 18 da Lei nº 9.279, de 14 de maio de 1996, tornando não patenteáveis os medicamentos para o tratamento da Síndrome da Imunodeficiência Adquirida.', 'Camara', '28528', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=42801'),
  ('PL', '4679', 2001, 'Dispõe sobre a obrigatoriedade de adição de farinha de mandioca refinada, de farinha de raspa de mandioca ou de fécula de mandioca à farinha de trigo.', 'Camara', '28530', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=17999'),
  ('PL', '4680', 2001, 'Regulamenta o exercício das atividades profissionais de Yôga e cria os Conselhos Federal e Regionais e Yôga.', 'Camara', '28547', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=14341'),
  ('PL', '4681', 2001, 'Dispõe sobre a dublagem de filmes estrangeiros importados para exibição através de radiodifusão de sons e imagens (televisão) por assinatura e fitas ou discos para vídeo.', 'Camara', '28548', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=14979'),
  ('PL', '2762', 2003, 'Institui o dia 31 de Outubro como o Dia do Saci e dá outras providências.', 'Camara', '148717', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=189684'),
  ('PL', '4791', 2009, 'Submete ao Congresso Nacional a demarcação de terras tradicionalmente ocupadas pelos índios.', 'Camara', '425192', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=635639'),
  ('PL', '6625', 2009, 'Dispõe sobre o assédio moral nas relações de trabalho.', 'Camara', '464348', 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=726048')
) AS v(
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor
);

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'aldo-rebelo'
)
INSERT INTO projetos_lei (
  candidato_id,
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor
)
SELECT
  target.candidato_id,
  seed.tipo,
  seed.numero,
  seed.ano,
  seed.ementa,
  seed.fonte,
  seed.proposicao_id_api,
  seed.url_inteiro_teor
FROM target
CROSS JOIN _seed_aldo_rebelo_completo_projetos AS seed
ON CONFLICT (candidato_id, proposicao_id_api) DO NOTHING;

-- Pos-condicao: 38 rows totais; todos os 38 proposicao_id_api do inventario presentes
DO $$
DECLARE
  cand_id uuid;
  total_after int;
  inventario_present int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'aldo-rebelo';

  SELECT count(*) INTO total_after FROM projetos_lei WHERE candidato_id = cand_id;
  IF total_after <> 38 THEN
    RAISE EXCEPTION 'Pos-apply: esperadas 38 rows totais para aldo-rebelo, encontradas %', total_after;
  END IF;

  SELECT count(*) INTO inventario_present
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('16058', '236104', '215514', '25630', '20924', '222064', '222607', '21090', '170071', '15254', '175199', '179195', '188956', '236105', '18731', '20075', '20641', '38127', '20916', '21627', '21698', '14509', '15958', '16260', '25187', '17069', '17804', '18744', '18904', '18905', '28526', '28528', '28530', '28547', '28548', '148717', '425192', '464348');
  IF inventario_present <> 38 THEN
    RAISE EXCEPTION 'Pos-apply: esperados 38 proposicao_id_api do inventario presentes, encontrados %', inventario_present;
  END IF;

  RAISE NOTICE 'Pos-apply aldo-rebelo completo: total=% inventario_present=%',
    total_after, inventario_present;
END $$;
