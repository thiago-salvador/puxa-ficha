BEGIN;

CREATE TEMP TABLE raw_core_history_lote2 (
  slug text NOT NULL,
  tipo_evento text NOT NULL,
  cargo text NOT NULL,
  cargo_canonico text NOT NULL,
  estado text,
  periodo_inicio integer NOT NULL,
  periodo_fim integer,
  partido text,
  eleito_por text,
  observacoes text NOT NULL,
  proveniencia text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_history_lote2 (
  slug,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
VALUES
  ('cyro-garcia', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'RJ', 2010, 2010, 'PSTU', 'nao eleito', 'Candidatura TSE 2010, RJ, governador, SQ 190000000626, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cyro-garcia', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2012, 2012, 'PSTU', 'nao eleito', 'Candidatura TSE 2012, Rio de Janeiro/RJ, prefeito, SQ 190000004022, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cyro-garcia', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'RJ', 2014, 2014, 'PSTU', 'nao eleito', 'Candidatura TSE 2014, RJ, deputado federal, SQ 190000000098, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cyro-garcia', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2016, 2016, 'PSTU', 'nao eleito', 'Candidatura TSE 2016, Rio de Janeiro/RJ, prefeito, SQ 190000019572, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cyro-garcia', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'RJ', 2018, 2018, 'PSTU', 'nao eleito', 'Candidatura TSE 2018, RJ, senador, SQ 190000607900, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cyro-garcia', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2020, 2020, 'PSTU', 'nao eleito', 'Candidatura TSE 2020, Rio de Janeiro/RJ, prefeito, SQ 190000858699, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cyro-garcia', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'RJ', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, RJ, governador, SQ 190001639537, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cyro-garcia', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2024, 2024, 'PSTU', 'nao eleito', 'Candidatura TSE 2024, Rio de Janeiro/RJ, prefeito, SQ 190001951101, resultado NAO ELEITO.', 'tse'),

  ('cleber-rabelo', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PA', 2010, 2010, 'PSTU', 'nao eleito', 'Candidatura TSE 2010, PA, governador, SQ 140000000107, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cleber-rabelo', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PA', 2012, 2012, 'PSTU', 'eleito por QP', 'Candidatura TSE 2012, PA, vereador, SQ 140000015615, situacao APTO, resultado ELEITO POR QP.', 'tse'),
  ('cleber-rabelo', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PA', 2014, 2014, 'PSTU', 'suplente', 'Candidatura TSE 2014, PA, deputado federal, SQ 140000000102, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('cleber-rabelo', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PA', 2016, 2016, 'PSTU', 'nao eleito', 'Candidatura TSE 2016, PA, prefeito, SQ 140000006431, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cleber-rabelo', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PA', 2018, 2018, 'PSTU', 'nao eleito', 'Candidatura TSE 2018, PA, governador, SQ 140000604130, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cleber-rabelo', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PA', 2020, 2020, 'PSTU', 'nao eleito', 'Candidatura TSE 2020, PA, prefeito, SQ 140000637323, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cleber-rabelo', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PA', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, PA, governador, SQ 140001650519, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('lourdes-melo', 'candidatura', 'Candidatura a Vice-Prefeito', 'Candidatura a Vice-Prefeito', 'PI', 2012, 2012, 'PCB', 'nao eleito', 'Candidatura TSE 2012, PI, vice-prefeito, SQ 180000012118, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('lourdes-melo', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PI', 2014, 2014, 'PCO', 'nao eleito', 'Candidatura TSE 2014, PI, governador, SQ 180000000138, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('lourdes-melo', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PI', 2016, 2016, 'PCO', 'nao eleito', 'Candidatura TSE 2016, PI, prefeito, SQ 180000008711, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('lourdes-melo', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PI', 2018, 2018, 'PCO', 'nao eleito', 'Candidatura TSE 2018, PI, governador, SQ 180000626503, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('lourdes-melo', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PI', 2020, 2020, 'PCO', 'nao eleito', 'Candidatura TSE 2020, PI, prefeito, SQ 180001237871, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('lourdes-melo', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PI', 2022, 2022, 'PCO', 'nao eleito', 'Candidatura TSE 2022, PI, governador, SQ 180001713460, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('lourdes-melo', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PI', 2024, 2024, 'PCO', 'nao eleito', 'Candidatura TSE 2024, PI, prefeito, SQ 180002337603, resultado NAO ELEITO.', 'tse'),

  ('cintia-dias', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'GO', 2010, 2010, 'PSOL', 'nao eleito', 'Candidatura TSE 2010, GO, deputado estadual, SQ 90000000434, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cintia-dias', 'candidatura', 'Candidatura a Vice-Governador', 'Candidatura a Vice-Governador', 'GO', 2014, 2014, 'PSOL', 'nao eleito', 'Candidatura TSE 2014, GO, vice-governador, SQ 90000000511, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cintia-dias', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'GO', 2020, 2020, 'PSOL', 'suplente', 'Candidatura TSE 2020, Goiania/GO, vereador, SQ 90000746350, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('cintia-dias', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'GO', 2022, 2022, 'PSOL', 'nao eleito', 'Candidatura TSE 2022, GO, governador, SQ 90001674691, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('cintia-dias', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'GO', 2024, 2024, 'PSOL', 'nao eleito', 'Candidatura TSE 2024, Goiania/GO, vereador, SQ 90002192685, resultado NAO ELEITO.', 'tse'),

  ('dario-barbosa', 'candidatura', 'Candidatura a Vice-Prefeito', 'Candidatura a Vice-Prefeito', 'RN', 2012, 2012, 'PSOL', 'nao eleito', 'Candidatura TSE 2012, Natal/RN, vice-prefeito, SQ 200000001258, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('dario-barbosa', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'RN', 2014, 2014, 'PSTU', 'nao eleito', 'Candidatura TSE 2014, RN, deputado estadual, SQ 200000000011, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('dario-barbosa', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RN', 2016, 2016, 'PSTU', 'nao eleito', 'Candidatura TSE 2016, Natal/RN, vereador, SQ 200000011476, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('dario-barbosa', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'RN', 2018, 2018, 'PSTU', 'nao eleito', 'Candidatura TSE 2018, RN, governador, SQ 200000611619, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('dario-barbosa', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'RN', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, RN, senador, SQ 200001652247, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('geraldo-carvalho', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PI', 2010, 2010, 'PSTU', 'nao eleito', 'Candidatura TSE 2010, PI, governador, SQ 180000000355, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('geraldo-carvalho', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'PI', 2014, 2014, 'PSTU', 'nao eleito', 'Candidatura TSE 2014, PI, senador, SQ 180000000003, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('geraldo-carvalho', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2016, 2016, 'PSTU', 'nao eleito', 'Candidatura TSE 2016, Teresina/PI, vereador, SQ 180000007088, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('geraldo-carvalho', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PI', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, PI, governador, SQ 180001613545, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('geraldo-carvalho', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PI', 2024, 2024, 'PSTU', 'nao eleito', 'Candidatura TSE 2024, Teresina/PI, prefeito, SQ 180001930348, resultado NAO ELEITO.', 'tse'),

  ('gustavo-henrique', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2012, 2012, 'PSC', 'suplente', 'Candidatura TSE 2012, Nazaria/PI, vereador, SQ 180000006226, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('gustavo-henrique', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'PI', 2014, 2014, 'PSC', 'nao eleito', 'Candidatura TSE 2014, PI, senador, SQ 180000000014, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('gustavo-henrique', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2016, 2016, 'PSC', 'nao eleito', 'Candidatura TSE 2016, Teresina/PI, vereador, SQ 180000009933, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('gustavo-henrique', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2020, 2020, 'AVANTE', 'suplente', 'Candidatura TSE 2020, Teresina/PI, vereador, SQ 180000726521, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('gustavo-henrique', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PI', 2022, 2022, 'PATRIOTA', 'nao eleito', 'Candidatura TSE 2022, PI, governador, SQ 180001643494, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('mainha', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PI', 2010, 2010, 'DEM', 'suplente', 'Candidatura TSE 2010, PI, deputado federal, SQ 180000000113, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('mainha', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PI', 2012, 2012, 'DEM', 'nao eleito', 'Candidatura TSE 2012, Itainopolis/PI, prefeito, SQ 180000008377, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('mainha', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PI', 2014, 2014, 'SD', 'suplente', 'Candidatura TSE 2014, PI, deputado federal, SQ 180000000234, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('mainha', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PI', 2018, 2018, 'PP', 'suplente', 'Candidatura TSE 2018, PI, deputado federal, SQ 180000613923, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('mainha', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PI', 2022, 2022, 'SOLIDARIEDADE', 'nao eleito', 'Candidatura TSE 2022, PI, deputado federal, SQ 180001601335, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('samuel-costa', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RO', 2012, 2012, 'PR', 'suplente', 'Candidatura TSE 2012, Porto Velho/RO, vereador, SQ 220000000290, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('samuel-costa', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'RO', 2014, 2014, 'PT do B', 'suplente', 'Candidatura TSE 2014, RO, deputado estadual, SQ 220000000176, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('samuel-costa', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RO', 2020, 2020, 'PC do B', 'nao eleito', 'Candidatura TSE 2020, Porto Velho/RO, prefeito, SQ 220000685117, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('samuel-costa', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'RO', 2022, 2022, 'PC do B', 'nao eleito', 'Candidatura TSE 2022, RO, deputado federal, SQ 220001612149, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('samuel-costa', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RO', 2024, 2024, 'REDE', 'nao eleito', 'Candidatura TSE 2024, Porto Velho/RO, prefeito, SQ 220002330987, resultado NAO ELEITO.', 'tse'),

  ('william-siri', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RJ', 2016, 2016, 'PSOL', 'suplente', 'Candidatura TSE 2016, Rio de Janeiro/RJ, vereador, SQ 190000003430, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('william-siri', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'RJ', 2018, 2018, 'PSOL', 'suplente', 'Candidatura TSE 2018, RJ, deputado estadual, SQ 190000602173, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('william-siri', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RJ', 2020, 2020, 'PSOL', 'eleito por media', 'Candidatura TSE 2020, Rio de Janeiro/RJ, vereador, SQ 190000684938, situacao APTO, resultado ELEITO POR MEDIA.', 'tse'),
  ('william-siri', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'RJ', 2022, 2022, 'PSOL', 'suplente', 'Candidatura TSE 2022, RJ, deputado federal, SQ 190001600466, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('william-siri', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RJ', 2024, 2024, 'PSOL', 'eleito por QP', 'Candidatura TSE 2024, Rio de Janeiro/RJ, vereador, SQ 190002142537, resultado ELEITO POR QP.', 'tse'),

  ('alexandre-kalil', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'MG', 2014, 2014, 'PSB', 'nao eleito', 'Candidatura TSE 2014, MG, deputado federal, SQ 130000001203, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('alexandre-kalil', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'MG', 2016, 2016, 'PHS', 'segundo turno', 'Candidatura TSE 2016, Belo Horizonte/MG, prefeito, SQ 130000083186, situacao APTO, resultado 2o TURNO.', 'tse'),
  ('alexandre-kalil', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'MG', 2020, 2020, 'PSD', 'eleito', 'Candidatura TSE 2020, Belo Horizonte/MG, prefeito, SQ 130000756879, situacao APTO, resultado ELEITO.', 'tse'),
  ('alexandre-kalil', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'MG', 2022, 2022, 'PSD', 'nao eleito', 'Candidatura TSE 2022, MG, governador, SQ 130001621812, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('jeferson-bezerra', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MS', 2016, 2016, 'PV', 'suplente', 'Candidatura TSE 2016, Dourados/MS, vereador, SQ 120000001730, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('jeferson-bezerra', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'MS', 2020, 2020, 'PMN', 'nao eleito', 'Candidatura TSE 2020, Dourados/MS, prefeito, SQ 120000850578, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('jeferson-bezerra', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'MS', 2022, 2022, 'AGIR', 'nao eleito', 'Candidatura TSE 2022, MS, senador, SQ 120001611531, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('jeferson-bezerra', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MS', 2024, 2024, 'PV', 'suplente', 'Candidatura TSE 2024, Dourados/MS, vereador, SQ 120002315556, resultado SUPLENTE.', 'tse'),

  ('juliete-pantoja', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RJ', 2012, 2012, 'PSC', 'nao eleito', 'Candidatura TSE 2012, Duque de Caxias/RJ, vereador, SQ 190000028329, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('juliete-pantoja', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RJ', 2020, 2020, 'UP', 'nao eleito', 'Candidatura TSE 2020, Duque de Caxias/RJ, vereador, SQ 190001128515, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('juliete-pantoja', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'RJ', 2022, 2022, 'UP', 'nao eleito', 'Candidatura TSE 2022, RJ, governador, SQ 190001609712, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('juliete-pantoja', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2024, 2024, 'UP', 'nao eleito', 'Candidatura TSE 2024, Duque de Caxias/RJ, prefeito, SQ 190002135108, resultado NAO ELEITO.', 'tse'),

  ('laudicerio-aguiar', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'MT', 2018, 2018, 'DC', 'nao eleito', 'Candidatura TSE 2018, MT, deputado federal, SQ 110000619196, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('laudicerio-aguiar', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MT', 2020, 2020, 'PSB', 'suplente', 'Candidatura TSE 2020, Cuiaba/MT, vereador, SQ 110000677466, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('laudicerio-aguiar', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'MT', 2022, 2022, 'PP', 'suplente', 'Candidatura TSE 2022, MT, deputado estadual, SQ 110001621192, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('laudicerio-aguiar', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MT', 2024, 2024, 'UNIAO', 'suplente', 'Candidatura TSE 2024, Cuiaba/MT, vereador, SQ 110002118851, resultado SUPLENTE.', 'tse');

INSERT INTO public.historico_politico (
  candidato_id,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
SELECT
  c.id,
  h.tipo_evento,
  h.cargo,
  h.cargo_canonico,
  h.estado,
  h.periodo_inicio,
  h.periodo_fim,
  h.partido,
  h.eleito_por,
  h.observacoes,
  h.proveniencia
FROM raw_core_history_lote2 h
JOIN public.candidatos c ON c.slug = h.slug
ON CONFLICT (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL
DO UPDATE SET
  tipo_evento = EXCLUDED.tipo_evento,
  cargo = EXCLUDED.cargo,
  estado = EXCLUDED.estado,
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes,
  proveniencia = EXCLUDED.proveniencia;

CREATE TEMP TABLE raw_core_patrimonio_lote2 (
  slug text PRIMARY KEY,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote2 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('cyro-garcia', 2024, 280000.00, '190001951101'),
  ('cleber-rabelo', 2022, 80000.00, '140001650519'),
  ('lourdes-melo', 2024, 900000.00, '180002337603'),
  ('cintia-dias', 2024, 1021677.68, '90002192685'),
  ('dario-barbosa', 2022, 340000.00, '200001652247'),
  ('geraldo-carvalho', 2024, 400000.00, '180001930348'),
  ('gustavo-henrique', 2020, 140000.00, '180000726521'),
  ('mainha', 2022, 542999.60, '180001601335'),
  ('samuel-costa', 2024, 4434837.08, '220002330987'),
  ('william-siri', 2024, 268234.16, '190002142537'),
  ('alexandre-kalil', 2022, 7305641.76, '130001621812'),
  ('jeferson-bezerra', 2016, 20000.00, '120000001730'),
  ('juliete-pantoja', 2022, 407.98, '190001609712'),
  ('laudicerio-aguiar', 2024, 21242.00, '110002118851');

INSERT INTO public.patrimonio (
  candidato_id,
  ano_eleicao,
  valor_total,
  bens,
  fonte
)
SELECT
  c.id,
  p.ano_eleicao,
  p.valor_total,
  '[]'::jsonb,
  'TSE Dados Abertos bem_candidato_' || p.ano_eleicao || ' SQ ' || p.sq_candidato || ' (total agregado)'
FROM raw_core_patrimonio_lote2 p
JOIN public.candidatos c ON c.slug = p.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio existing
  WHERE existing.candidato_id = c.id
    AND existing.ano_eleicao = p.ano_eleicao
    AND existing.fonte = 'TSE Dados Abertos bem_candidato_' || p.ano_eleicao || ' SQ ' || p.sq_candidato || ' (total agregado)'
);

DO $$
DECLARE
  expected_history integer;
  actual_history integer;
  expected_patrimonio integer;
  actual_patrimonio integer;
  still_raw integer;
BEGIN
  SELECT count(*) INTO expected_history FROM raw_core_history_lote2;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote2 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote2 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote2;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote2 p
  JOIN public.candidatos c ON c.slug = p.slug
  JOIN public.patrimonio pat
    ON pat.candidato_id = c.id
   AND pat.ano_eleicao = p.ano_eleicao
   AND pat.valor_total = p.valor_total;

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote2 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote2
  ),
  counts AS (
    SELECT
      c.slug,
      (SELECT count(*) FROM public.historico_politico hp WHERE hp.candidato_id = c.id) AS historico_count,
      (SELECT count(*) FROM public.patrimonio pat WHERE pat.candidato_id = c.id) AS patrimonio_count,
      (SELECT count(*) FROM public.financiamento f WHERE f.candidato_id = c.id) AS financiamento_count,
      (SELECT count(*) FROM public.votos_candidato v WHERE v.candidato_id = c.id) AS votos_count,
      (SELECT count(*) FROM public.projetos_lei pl WHERE pl.candidato_id = c.id) AS projetos_count,
      (SELECT count(*) FROM public.legislacao_mandato_executivo lme WHERE lme.candidato_id = c.id) AS legislacao_count,
      (SELECT count(*) FROM public.gastos_parlamentares gp WHERE gp.candidato_id = c.id) AS gastos_count
    FROM lote_slugs l
    JOIN public.candidatos_publico c ON c.slug = l.slug
  )
  SELECT count(*) INTO still_raw
  FROM counts
  WHERE historico_count <= 1
    AND patrimonio_count = 0
    AND financiamento_count = 0
    AND votos_count = 0
    AND projetos_count = 0
    AND legislacao_count = 0
    AND gastos_count = 0;

  IF still_raw <> 0 THEN
    RAISE EXCEPTION 'raw core lote2 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
