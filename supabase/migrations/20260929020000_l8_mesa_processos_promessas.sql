-- 20260929020000_l8_mesa_processos_promessas.sql
-- L8, decisões da Mesa editorial de 29/09/2026. APROVADO, NAO APLICADO.
-- Lista fechada: scripts/audit/allowlist-l8-mesa-20260929.json (chave lista_fechada),
-- gerada por scripts/audit/derivar-lista-l8-mesa.ts e scripts/gerar-migration-l8-mesa.ts.
-- Processos: 31 CNJs novos em 26 fichas (DJEN reconsultado, marcador curadoria-mesa-l8-20260929),
-- 6 linhas já publicadas ganham o CNJ (1 com status corrigido) e
-- 26 recibos coleta_log 'encontrado'. Promessas: 1 vínculo verificado,
-- 6 inseridos e 10 retirados da ficha. projetos_lei: 1
-- autoria corrigida (signatário, não autor). Toda linha alterada tem preimagem md5
-- medida em produção; divergência aborta a transação inteira.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.processos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.compromisso_evidencia IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.coleta_log IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_processos_curadoria (
  slug text NOT NULL, candidato_id uuid NOT NULL, tipo text NOT NULL,
  tribunal text NOT NULL, numero_cnj text NOT NULL, descricao text NOT NULL,
  status text NOT NULL, fonte text NOT NULL, url_fonte text NOT NULL,
  PRIMARY KEY (slug, numero_cnj)
) ON COMMIT DROP;
INSERT INTO _pf_processos_curadoria
  (slug, candidato_id, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
  ('alvaro-dias-rn', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80', 'civil', 'STJ', '0834444-65.2019.8.20.5001', 'O DJEN registra comunicação processual oficial no processo 0834444-65.2019.8.20.5001, nas classes AGRAVO EM RECURSO ESPECIAL, perante AJC COORDENADORIA DE JULGAMENTO COLEGIADO DA PRIMEIRA TURMA (STJ). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2023-09-18 e 2026-08-10. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0834444-65.2019.8.20.5001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08344446520198205001'),
  ('david-almeida', 'edddfd43-0528-41eb-977a-feacdbbbe8fc', 'civil', 'TJAM', '0733188-83.2022.8.04.0001', 'O DJEN registra comunicação processual oficial no processo 0733188-83.2022.8.04.0001, nas classes AÇÃO POPULAR, perante 4ª Vara da Fazenda Pública (TJAM). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2025-09-18 e 2025-09-18. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0733188-83.2022.8.04.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=07331888320228040001'),
  ('douglas-ruas', '097dc8d0-d05d-42cb-91a0-0582dd561f76', 'civil', 'TJRJ', '0816373-64.2024.8.19.0087', 'O DJEN registra comunicação processual oficial no processo 0816373-64.2024.8.19.0087, nas classes PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL, perante 2º Juizado Especial Cível da Regional de Alcântara (TJRJ). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2024-11-18 e 2024-11-25. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0816373-64.2024.8.19.0087', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08163736420248190087'),
  ('eduardo-paes', '242af65c-dae1-447c-b4b0-c26095f7384d', 'civil', 'TJRJ', '0962726-74.2023.8.19.0001', 'O DJEN registra comunicação processual oficial no processo 0962726-74.2023.8.19.0001, nas classes AÇÃO POPULAR, perante 6ª Vara de Fazenda Pública da Comarca da Capital (TJRJ). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2025-05-21 e 2026-09-21. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0962726-74.2023.8.19.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=09627267420238190001'),
  ('felipe-camarao', '0c0e1b6a-cfa6-4da7-82ab-a8ea90b55200', 'civil', 'TJMA', '0818103-61.2026.8.10.0000', 'O DJEN registra comunicação processual oficial no processo 0818103-61.2026.8.10.0000, nas classes MANDADO DE SEGURANÇA CÍVEL, perante Órgão Especial (TJMA). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2026-06-12 e 2026-06-22. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0818103-61.2026.8.10.0000', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08181036120268100000'),
  ('gabriel-azevedo', '2081565f-e38d-4246-81d6-4f28979e8136', 'civil', 'TJMG', '5196901-38.2023.8.13.0024', 'O DJEN registra comunicação processual oficial no processo 5196901-38.2023.8.13.0024, nas classes MANDADO DE SEGURANÇA CÍVEL, perante 1ª Vara dos Feitos da Fazenda Pública Municipal da Comarca de Belo Horizonte (TJMG). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2025-02-17 e 2025-02-17. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 5196901-38.2023.8.13.0024', 'https://comunica.pje.jus.br/consulta?numeroProcesso=51969013820238130024'),
  ('jhc', 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75', 'civil', 'TJAL', '0760129-22.2025.8.02.0001', 'O DJEN registra comunicação processual oficial no processo 0760129-22.2025.8.02.0001, nas classes APELAÇÃO CÍVEL, perante 4ª Câmara Cível (TJAL). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2025-11-25 e 2026-07-31. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0760129-22.2025.8.02.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=07601292220258020001'),
  ('laurez-moreira', 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1', 'civil', 'TJTO', '0012601-54.2026.8.27.2700', 'O DJEN registra comunicação processual oficial no processo 0012601-54.2026.8.27.2700, nas classes SUSPENSÃO DE LIMINAR E DE SENTENÇA, perante TRIBUNAL PLENO (TJTO). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2026-06-17 e 2026-09-23. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0012601-54.2026.8.27.2700', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00126015420268272700'),
  ('laurez-moreira', 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1', 'civil', 'TJTO', '0024560-32.2026.8.27.2729', 'O DJEN registra comunicação processual oficial no processo 0024560-32.2026.8.27.2729, nas classes PROCEDIMENTO COMUM CÍVEL, perante 1ª Vara da Fazenda e Reg. Públicos de Palmas (TJTO). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2026-05-26 e 2026-08-25. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0024560-32.2026.8.27.2729', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00245603220268272729'),
  ('luciano-zucco', '53af44cf-7f66-44d3-b733-1114c5143e6a', 'civil', 'TJRS', '5230719-57.2025.8.21.0001', 'O DJEN registra comunicação processual oficial no processo 5230719-57.2025.8.21.0001, nas classes TUTELA ANTECIPADA ANTECEDENTE, perante 12ª Vara Cível do Foro Central da Comarca de Porto Alegre (TJRS). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2025-09-08 e 2026-07-15. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 5230719-57.2025.8.21.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=52307195720258210001'),
  ('lula', 'd6740de5-c7d9-4978-ab49-b51a22481aa2', 'civil', 'TRF3', '5035251-02.2023.4.03.6100', 'O DJEN registra comunicação processual oficial no processo 5035251-02.2023.4.03.6100, nas classes AÇÃO POPULAR, perante 13ª Vara Cível Federal de São Paulo (TRF3). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2023-12-04 e 2026-06-23. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 5035251-02.2023.4.03.6100', 'https://comunica.pje.jus.br/consulta?numeroProcesso=50352510220234036100'),
  ('marconi-perillo', '95fc116b-4c1e-4332-9c52-948bc1775a57', 'improbidade', 'TJGO', '5107881-05.2019.8.09.0051', 'O DJEN registra comunicação processual oficial no processo 5107881-05.2019.8.09.0051, nas classes AÇÃO CIVIL DE IMPROBIDADE ADMINISTRATIVA, perante Goiânia - 2ª Vara da Fazenda Pública Estadual (TJGO). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2025-02-19 e 2026-07-21. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 5107881-05.2019.8.09.0051', 'https://comunica.pje.jus.br/consulta?numeroProcesso=51078810520198090051'),
  ('marconi-perillo', '95fc116b-4c1e-4332-9c52-948bc1775a57', 'improbidade', 'TJGO', '5455799-63.2018.8.09.0051', 'O DJEN registra comunicação processual oficial no processo 5455799-63.2018.8.09.0051, nas classes AÇÃO CIVIL DE IMPROBIDADE ADMINISTRATIVA, perante Goiânia - 5ª Vara da Fazenda Pública Estadual (TJGO). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2025-04-02 e 2026-04-06. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 5455799-63.2018.8.09.0051', 'https://comunica.pje.jus.br/consulta?numeroProcesso=54557996320188090051'),
  ('professora-dorinha', '00c6fd60-9151-43d2-b1e4-ea45371511a8', 'civil', 'TJTO', '0051353-42.2025.8.27.2729', 'O DJEN registra comunicação processual oficial no processo 0051353-42.2025.8.27.2729, nas classes PROCEDIMENTO COMUM CÍVEL, perante SECRETARIA JUDICIAL UNIFICADA DAS VARAS CÍVEIS DA COMARCA DE PALMAS (TJTO). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2025-11-10 e 2025-12-05. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0051353-42.2025.8.27.2729', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00513534220258272729'),
  ('rafael-fonteles', '57b743d5-db7b-4048-862d-9378a9fff366', 'civil', 'TJPI', '0831944-06.2025.8.18.0140', 'O DJEN registra comunicação processual oficial no processo 0831944-06.2025.8.18.0140, nas classes AÇÃO POPULAR, perante 2ª Vara dos Feitos da Fazenda Pública da Comarca de Teresina (TJPI). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2025-07-08 e 2025-10-01. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0831944-06.2025.8.18.0140', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08319440620258180140'),
  ('requiao-filho', '36ec7b14-9da3-4324-820d-6318ce535d01', 'civil', 'TJPR', '0018945-77.2024.8.16.0000', 'O DJEN registra comunicação processual oficial no processo 0018945-77.2024.8.16.0000, nas classes MANDADO DE SEGURANÇA CÍVEL, perante Órgão Especial (TJPR). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2024-03-07 e 2024-08-14. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0018945-77.2024.8.16.0000', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00189457720248160000'),
  ('requiao-filho', '36ec7b14-9da3-4324-820d-6318ce535d01', 'civil', 'TJPR', '0071998-41.2022.8.16.0000', 'O DJEN registra comunicação processual oficial no processo 0071998-41.2022.8.16.0000, nas classes MANDADO DE SEGURANÇA CÍVEL, perante Órgão Especial (TJPR). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2022-11-28 e 2022-11-28. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0071998-41.2022.8.16.0000', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00719984120228160000'),
  ('roberto-cidade', 'fa96e1ad-f460-411b-b30b-3aecb135e8d7', 'civil', 'TJAM', '0013401-70.2025.8.04.9001', 'O DJEN registra comunicação processual oficial no processo 0013401-70.2025.8.04.9001, nas classes AGRAVO DE INSTRUMENTO, perante Segunda Câmara Cível (TJAM). O candidato consta no polo passivo. As comunicações Intimação e Lista de distribuição foram disponibilizadas entre 2025-07-22 e 2026-07-02. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0013401-70.2025.8.04.9001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00134017020258049001'),
  ('tarcisio-gov-sp', '1919a599-1f61-41cc-ab6a-cd4baa77e639', 'civil', 'TJSP', '2052422-44.2025.8.26.0000', 'O DJEN registra comunicação processual oficial no processo 2052422-44.2025.8.26.0000, nas classes AGRAVO DE INSTRUMENTO, perante Processamento 4º Grupo - 9ª Câmara Direito Público - Praça Almeida Jr., 72 - 1º andar, sala 12 (TJSP). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2025-06-02 e 2025-06-02. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 2052422-44.2025.8.26.0000', 'https://comunica.pje.jus.br/consulta?numeroProcesso=20524224420258260000'),
  ('tse-2026-100002537338', '63776260-c37b-4112-8eca-eb338e88abf5', 'criminal', 'TJDFT', '0754385-08.2025.8.07.0001', 'O DJEN registra comunicação processual oficial no processo 0754385-08.2025.8.07.0001, nas classes CRIMES DE CALÚNIA, INJÚRIA E DIFAMAÇÃO DE COMPETÊNCIA DO JUIZ SINGULAR, perante 2ª Vara Criminal de Brasília (TJDFT). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2025-10-14 e 2025-10-29. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0754385-08.2025.8.07.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=07543850820258070001'),
  ('tse-2026-110002544986', '7e16885c-67f9-49bd-83f1-2ab42cbfc93e', 'civil', 'TJPR', '0000029-41.1998.8.16.0053', 'O DJEN registra comunicação processual oficial no processo 0000029-41.1998.8.16.0053, nas classes EMBARGOS À EXECUÇÃO, perante Vara Cível de Bela Vista do Paraíso (TJPR). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2026-05-08 e 2026-08-28. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0000029-41.1998.8.16.0053', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00000294119988160053'),
  ('tse-2026-120002547434', '5ca3ab90-3e9a-4356-8b54-9cda5ad7c0fc', 'civil', 'TJDFT', '0754389-79.2024.8.07.0001', 'O DJEN registra comunicação processual oficial no processo 0754389-79.2024.8.07.0001, nas classes CUMPRIMENTO DE SENTENÇA, perante 16ª Vara Cível de Brasília (TJDFT). O candidato consta no polo passivo. As comunicações Edital e Intimação foram disponibilizadas entre 2024-12-16 e 2026-05-18. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0754389-79.2024.8.07.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=07543897920248070001'),
  ('tse-2026-200002534448', '00b630c2-c244-4fbf-b273-2ebe9e4b7ac2', 'civil', 'TJRN', '0806004-06.2026.8.20.5004', 'O DJEN registra comunicação processual oficial no processo 0806004-06.2026.8.20.5004, nas classes PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL, perante 5º Juizado Especial Cível da Comarca de Natal (TJRN). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2026-04-10 e 2026-06-17. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0806004-06.2026.8.20.5004', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08060040620268205004'),
  ('tse-2026-200002534448', '00b630c2-c244-4fbf-b273-2ebe9e4b7ac2', 'civil', 'TJRN', '0808034-14.2026.8.20.5004', 'O DJEN registra comunicação processual oficial no processo 0808034-14.2026.8.20.5004, nas classes PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL, perante 7º Juizado Especial Cível da Comarca de Natal (TJRN). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2026-05-29 e 2026-08-10. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0808034-14.2026.8.20.5004', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08080341420268205004'),
  ('tse-2026-20002553727', 'e851e611-79b9-4310-8793-36657061e2c6', 'civil', 'TJDFT', '0016830-09.1999.8.07.0001', 'O DJEN registra comunicação processual oficial no processo 0016830-09.1999.8.07.0001, nas classes CUMPRIMENTO DE SENTENÇA, perante 1ª Vara Cível de Brasília (TJDFT). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2023-09-04 e 2024-07-17. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0016830-09.1999.8.07.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00168300919998070001'),
  ('tse-2026-230002533586', 'ace0e65c-6b4c-474d-a848-0cc97ad6cff4', 'civil', 'TJRR', '0814999-49.2018.8.23.0010', 'O DJEN registra comunicação processual oficial no processo 0814999-49.2018.8.23.0010, nas classes EXECUÇÃO DE TÍTULO EXTRAJUDICIAL, perante 6ª Vara Cível - Execução de Boa Vista (TJRR). O candidato consta no polo ativo. As comunicações Intimação foram disponibilizadas entre 2026-02-24 e 2026-05-20. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0814999-49.2018.8.23.0010', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08149994920188230010'),
  ('tse-2026-230002533586', 'ace0e65c-6b4c-474d-a848-0cc97ad6cff4', 'civil', 'TJRR', '0842579-44.2024.8.23.0010', 'O DJEN registra comunicação processual oficial no processo 0842579-44.2024.8.23.0010, nas classes CUMPRIMENTO DE SENTENÇA, perante 1º Juizado Especial Cível de Boa Vista (TJRR). O candidato consta no polo ativo. As comunicações Intimação e Lista de distribuição foram disponibilizadas entre 2025-03-10 e 2026-07-02. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0842579-44.2024.8.23.0010', 'https://comunica.pje.jus.br/consulta?numeroProcesso=08425794420248230010'),
  ('tse-2026-230002549330', '4ba7a1d5-4402-4caa-a697-fe2ece8cb766', 'criminal', 'TJRR', '1000060-07.2023.8.23.0010', 'O DJEN registra comunicação processual oficial no processo 1000060-07.2023.8.23.0010, procedimento na Vara de Execução Penal de Boa Vista (TJRR, sistema SEEU) aberto por ordem do STF, em que a candidata consta no polo passivo. Segundo a Folha BV, o procedimento acompanha um acordo de não persecução penal relativo aos atos de 8 de janeiro de 2023. Acordo de não persecução penal não é condenação, e a publicação não informa pena nem culpa.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 1000060-07.2023.8.23.0010', 'https://comunica.pje.jus.br/consulta?numeroProcesso=10000600720238230010'),
  ('tse-2026-50002536317', 'bf2f745c-3c9e-4d50-93d5-f738e4bd5e6e', 'civil', 'TJBA', '0319830-75.2011.8.05.0001', 'O DJEN registra comunicação processual oficial no processo 0319830-75.2011.8.05.0001, nas classes AÇÃO POPULAR, perante 7ª V DA FAZENDA PÚBLICA DE SALVADOR (TJBA). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2026-05-18 e 2026-05-18. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0319830-75.2011.8.05.0001', 'https://comunica.pje.jus.br/consulta?numeroProcesso=03198307520118050001'),
  ('tse-2026-80002552373', 'f96e7c14-8cf9-4d89-8706-b6f00d2afc9b', 'civil', 'TJES', '0005122-65.2015.8.08.0035', 'O DJEN registra comunicação processual oficial no processo 0005122-65.2015.8.08.0035, nas classes AÇÃO POPULAR, perante Vila Velha - Comarca da Capital - 2ª Vara da Fazenda Pública Estadual, Municipal, Registros Públicos, Meio Ambiente e Execuções Fiscais (TJES). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2024-11-29 e 2025-11-25. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0005122-65.2015.8.08.0035', 'https://comunica.pje.jus.br/consulta?numeroProcesso=00051226520158080035'),
  ('tse-2026-90002541455', '2865ed18-771b-4cf9-b87f-a26da338e19e', 'civil', 'TJGO', '0218716-49.1999.8.09.0051', 'O DJEN registra comunicação processual oficial no processo 0218716-49.1999.8.09.0051, nas classes CUMPRIMENTO DE SENTENÇA, perante Goiânia - UPJ Varas da Fazenda Pública Estadual: 1ª, 6ª e 7ª (TJGO). O candidato consta no polo passivo. As comunicações Intimação foram disponibilizadas entre 2025-08-07 e 2026-06-25. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.', 'comunicacao_processual_publicada_merito_nao_inferido', 'curadoria-mesa-l8-20260929: Comunicações processuais oficiais do DJEN/CNJ - processo 0218716-49.1999.8.09.0051', 'https://comunica.pje.jus.br/consulta?numeroProcesso=02187164919998090051');

CREATE TEMP TABLE _pf_l8_recibos (
  slug text PRIMARY KEY, candidato_id uuid NOT NULL, volume integer NOT NULL,
  url text NOT NULL, detalhe text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_recibos VALUES
  ('alvaro-dias-rn', 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08344446520198205001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08344446520198205001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('david-almeida', 'edddfd43-0528-41eb-977a-feacdbbbe8fc'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07331888320228040001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07331888320228040001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('douglas-ruas', '097dc8d0-d05d-42cb-91a0-0582dd561f76'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08163736420248190087&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08163736420248190087&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('eduardo-paes', '242af65c-dae1-447c-b4b0-c26095f7384d'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=09627267420238190001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=09627267420238190001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('felipe-camarao', '0c0e1b6a-cfa6-4da7-82ab-a8ea90b55200'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08181036120268100000&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08181036120268100000&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('gabriel-azevedo', '2081565f-e38d-4246-81d6-4f28979e8136'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=51969013820238130024&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=51969013820238130024&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('jhc', 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07601292220258020001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07601292220258020001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('laurez-moreira', 'e4a0bfc6-586c-491f-8580-e43c6d30f7a1'::uuid, 2, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00126015420268272700&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00126015420268272700&pagina=1,https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00245603220268272729&pagina=1; detalhe=2 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('luciano-zucco', '53af44cf-7f66-44d3-b733-1114c5143e6a'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=52307195720258210001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=52307195720258210001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('lula', 'd6740de5-c7d9-4978-ab49-b51a22481aa2'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=50352510220234036100&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=50352510220234036100&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('marconi-perillo', '95fc116b-4c1e-4332-9c52-948bc1775a57'::uuid, 2, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=51078810520198090051&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=51078810520198090051&pagina=1,https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=54557996320188090051&pagina=1; detalhe=2 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('professora-dorinha', '00c6fd60-9151-43d2-b1e4-ea45371511a8'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00513534220258272729&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00513534220258272729&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('rafael-fonteles', '57b743d5-db7b-4048-862d-9378a9fff366'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08319440620258180140&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08319440620258180140&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('requiao-filho', '36ec7b14-9da3-4324-820d-6318ce535d01'::uuid, 2, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00189457720248160000&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00189457720248160000&pagina=1,https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00719984120228160000&pagina=1; detalhe=2 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('roberto-cidade', 'fa96e1ad-f460-411b-b30b-3aecb135e8d7'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00134017020258049001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00134017020258049001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tarcisio-gov-sp', '1919a599-1f61-41cc-ab6a-cd4baa77e639'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=20524224420258260000&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=20524224420258260000&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-100002537338', '63776260-c37b-4112-8eca-eb338e88abf5'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07543850820258070001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07543850820258070001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-110002544986', '7e16885c-67f9-49bd-83f1-2ab42cbfc93e'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00000294119988160053&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00000294119988160053&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-120002547434', '5ca3ab90-3e9a-4356-8b54-9cda5ad7c0fc'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07543897920248070001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=07543897920248070001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-200002534448', '00b630c2-c244-4fbf-b273-2ebe9e4b7ac2'::uuid, 2, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08060040620268205004&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08060040620268205004&pagina=1,https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08080341420268205004&pagina=1; detalhe=2 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-20002553727', 'e851e611-79b9-4310-8793-36657061e2c6'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00168300919998070001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00168300919998070001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-230002533586', 'ace0e65c-6b4c-474d-a848-0cc97ad6cff4'::uuid, 2, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08149994920188230010&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08149994920188230010&pagina=1,https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=08425794420248230010&pagina=1; detalhe=2 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-230002549330', '4ba7a1d5-4402-4caa-a697-fe2ece8cb766'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=10000600720238230010&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=10000600720238230010&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-50002536317', 'bf2f745c-3c9e-4d50-93d5-f738e4bd5e6e'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=03198307520118050001&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=03198307520118050001&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-80002552373', 'f96e7c14-8cf9-4d89-8706-b6f00d2afc9b'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00051226520158080035&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=00051226520158080035&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026'),
  ('tse-2026-90002541455', '2865ed18-771b-4cf9-b87f-a26da338e19e'::uuid, 1, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=02187164919998090051&pagina=1', 'revisao_em=2026-09-29; identidade=id-oficial; identidade_urls=https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip; urls_consultadas=https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=02187164919998090051&pagina=1; detalhe=1 processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 29/09/2026');

CREATE TEMP TABLE _pf_l8_processos_cnj (
  processo_id uuid PRIMARY KEY, slug text NOT NULL, candidato_id uuid NOT NULL,
  numero_cnj text NOT NULL, status_novo text, preimage_md5 text NOT NULL,
  lote text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_processos_cnj VALUES
  ('eb7b2f9b-9fc3-4e40-85a1-b942e18ce489'::uuid, 'lula', 'd6740de5-c7d9-4978-ab49-b51a22481aa2'::uuid, '5046512-94.2016.4.04.7000', NULL, '9d768802ed28e8c459c664a093199bbd', 'curadoria-mesa-l8-20260929'),
  ('743b4234-5865-4c02-90a0-7ce5c4060402'::uuid, 'lula', 'd6740de5-c7d9-4978-ab49-b51a22481aa2'::uuid, '5021365-32.2017.4.04.7000', NULL, 'a957405a5a32c8104faa2f9ce42dd847', 'curadoria-mesa-l8-20260929'),
  ('da8ce4a6-f40c-4e77-b527-e237fc378b74'::uuid, 'garotinho', '5e5ea2d1-1fa8-43f2-880f-14227c54423a'::uuid, '0002855-95.2010.8.19.0001', NULL, '0bc09e6dc0057d16029548799cba0e15', 'curadoria-mesa-l8-20260929'),
  ('d8fdc402-1e2a-46e2-9ccd-75f2af087d7d'::uuid, 'delcidio-amaral', '3c94a516-0481-45a5-a13e-ab082885cf65'::uuid, '0042543-76.2016.4.01.3400', NULL, 'cfbcdc1251000fbd6dbbd3de1161bb54', 'curadoria-mesa-l8-20260929'),
  ('17c955ab-1059-4e6d-bdd1-58c9d75f68c5'::uuid, 'victor-assis', '2cb5e948-08ea-4a25-8124-6aaac3155c70'::uuid, '0600110-06.2024.6.17.0008', NULL, '6a8c068237dad80deede92b6bcd2c77e', 'curadoria-mesa-l8-20260929'),
  ('05c04141-af8a-44c0-a92b-819a2f5ce984'::uuid, 'leandro-grass', '3b724874-8769-44f3-aab3-06c0155dc155'::uuid, '0602500-20.2022.6.07.0000', 'Inelegibilidade aplicada pelo TRE-DF revertida pelo TSE em maio de 2024 no recurso ordinário 0602500-20.2022.6.07.0000', '89ec755e391e9ce9d831928062c2ff7c', 'curadoria-mesa-l8-20260929');

CREATE TEMP TABLE _pf_l8_vinculos (
  id uuid PRIMARY KEY, acao text NOT NULL CHECK (acao IN ('verificar', 'despublicar')),
  slug text NOT NULL, candidato_id uuid NOT NULL, preimage_md5 text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_vinculos VALUES
  ('dbfd69d8-e997-4b32-9f01-e1282675dbee'::uuid, 'verificar', 'edmilson-costa', 'c7785d1d-b34a-4a0b-b9f2-127584b52d0c'::uuid, '7aad30ae4bf7cb0a142a468f40bb465b'),
  ('0d02ea00-c2d5-4516-a604-d459c1b2c93f'::uuid, 'despublicar', 'sergio-moro-gov-pr', '6025cfb5-d1a7-4ad0-baa7-c131b381e8fa'::uuid, '2a815742d2de29f4fb27fa587e7f7d16'),
  ('16eb95a6-5b7a-4e56-8e58-663223761fb7'::uuid, 'despublicar', 'luciano-zucco', '53af44cf-7f66-44d3-b733-1114c5143e6a'::uuid, 'bf76060e3ac1c034074c74ccc3ce0d90'),
  ('238ccde5-9ac1-41b0-9e92-a0c17581abcd'::uuid, 'despublicar', 'tarcisio-gov-sp', '1919a599-1f61-41cc-ab6a-cd4baa77e639'::uuid, 'b9f70ac50b9f00055c521b5f72168639'),
  ('9bc9faef-6188-493a-a724-e8f4a75b63d6'::uuid, 'despublicar', 'daniel-vilela', 'd80384f6-147b-40ef-8fa5-ae0b2be5a1f5'::uuid, '37c54921ab07ad0322e59e3caac28390'),
  ('a1e9b99d-485a-4322-b4e5-598923155243'::uuid, 'despublicar', 'lula', 'd6740de5-c7d9-4978-ab49-b51a22481aa2'::uuid, '8216c353bcd772e4ee01fa70c2eb01fe'),
  ('a72a3378-6665-4582-966b-f907139490d6'::uuid, 'despublicar', 'eduardo-paes', '242af65c-dae1-447c-b4b0-c26095f7384d'::uuid, 'e897721f603fb8ac38b1ddb53454df81'),
  ('e7046002-6714-4af5-9cd5-736a25d22e94'::uuid, 'despublicar', 'patrus-ananias', '123bd693-5482-4f0c-8ff3-40617acadba9'::uuid, '6fe3bbb5e74c08a655d09f57c56d3aca'),
  ('3531eebb-c738-4c59-b130-4a8bffc18481'::uuid, 'despublicar', 'lenilda-luna', '9677309d-5b33-4973-9bbb-d92b766557a3'::uuid, '25d18e965e2852e038fdbb26b6115536'),
  ('b0e63924-e06d-452c-a215-1418eb8e0710'::uuid, 'despublicar', 'rejane-oliveira', 'db4e22f8-ce30-4fcd-8799-a73be255d23a'::uuid, 'f6ab56c023b3e64a693e411667d12ff8'),
  ('502908ac-a0be-47fb-8f9e-ed40d591942b'::uuid, 'despublicar', 'sergio-moro-gov-pr', '6025cfb5-d1a7-4ad0-baa7-c131b381e8fa'::uuid, '2d65a7e005293cea4f4d2b869061cb6b');

CREATE TEMP TABLE _pf_l8_vinculos_novos (
  slug text NOT NULL, candidato_id uuid NOT NULL, programa_chave text NOT NULL,
  tema_id text NOT NULL, tipo_evidencia text NOT NULL, evidencia_ref text NOT NULL,
  PRIMARY KEY (programa_chave, tema_id, tipo_evidencia, evidencia_ref)
) ON COMMIT DROP;
INSERT INTO _pf_l8_vinculos_novos VALUES
  ('arinalda-do-mlb', 'a0d7bc78-cde7-49b1-a006-8d8dcf5449ce'::uuid, '2026:GOVERNADOR:RN:200002547826', 'moradia-digna', 'fala', '2805d974aeff7863f9769409edb482bde2cb8bfeb347dde5db30e7df783ffa2b'),
  ('efraim-filho', '8bef8b10-5c52-4e34-bf65-7af2ccc6caae'::uuid, '2026:GOVERNADOR:PB:150002538692', 'politica-tributaria', 'projeto_lei', '36646024-ab20-4ad9-8923-2cd87c920c51'),
  ('efraim-filho', '8bef8b10-5c52-4e34-bf65-7af2ccc6caae'::uuid, '2026:GOVERNADOR:PB:150002538692', 'politica-tributaria', 'projeto_lei', '375b10b7-af00-4c58-87b0-0b6dc78f6e32'),
  ('flavio-bolsonaro', '538fb04d-8fb4-486f-a7dd-9c78399a6353'::uuid, '2026:PRESIDENTE:BR:280002551544', 'economia-tributaria', 'votacao_chave', 'fc47ff55-3557-4ff1-8c93-d594246ece96'),
  ('luciano-zucco', '53af44cf-7f66-44d3-b733-1114c5143e6a'::uuid, '2026:GOVERNADOR:RS:210002547857', 'orientacao-economica', 'projeto_lei', '9a68aca1-b817-4bd4-a492-527c59c4ad63'),
  ('luciano-zucco', '53af44cf-7f66-44d3-b733-1114c5143e6a'::uuid, '2026:GOVERNADOR:RS:210002547857', 'orientacao-economica', 'votacao_chave', 'b56782fc-7a9f-476e-9946-3536edc1b332');

CREATE TEMP TABLE _pf_l8_autoria (
  id uuid PRIMARY KEY, candidato_id uuid NOT NULL, papel text NOT NULL,
  ordem integer NOT NULL, total integer NOT NULL, preimage_md5 text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_autoria VALUES
  ('a98a7316-6f21-400d-85a5-4c1859fccf79'::uuid, '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'signatario', 38, 171, 'ce86c6cb346ea7eb22fe3e2e321dd7bc');

CREATE TEMP TABLE _pf_l8_antes (tabela text NOT NULL, id uuid NOT NULL, antes jsonb NOT NULL, PRIMARY KEY (tabela, id)) ON COMMIT DROP;

DO $apply$
DECLARE n integer; soma integer := 0; v timestamptz := timestamptz '2026-09-29T02:00:00Z';
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'l8-mesa: apenas replay descartável; sem escrita';
    RETURN;
  END IF;

  -- Identidade, contagens fechadas e preimagens: qualquer divergência aborta.
  IF (SELECT count(*) FROM _pf_processos_curadoria) <> 31
     OR (SELECT count(DISTINCT slug) FROM _pf_processos_curadoria) <> 26
     OR (SELECT count(*) FROM _pf_l8_recibos) <> 26
     OR (SELECT count(*) FROM _pf_l8_processos_cnj) <> 6
     OR (SELECT count(*) FROM _pf_l8_vinculos WHERE acao = 'verificar') <> 1
     OR (SELECT count(*) FROM _pf_l8_vinculos WHERE acao = 'despublicar') <> 10
     OR (SELECT count(*) FROM _pf_l8_vinculos_novos) <> 6
     OR (SELECT count(*) FROM _pf_l8_autoria) <> 1
  THEN RAISE EXCEPTION 'l8-mesa: lista fechada divergiu das contagens'; END IF;

  IF EXISTS (SELECT 1 FROM (
       SELECT slug, candidato_id FROM _pf_processos_curadoria
       UNION SELECT slug, candidato_id FROM _pf_l8_processos_cnj
       UNION SELECT slug, candidato_id FROM _pf_l8_vinculos
       UNION SELECT slug, candidato_id FROM _pf_l8_vinculos_novos) u
     LEFT JOIN public.candidatos c ON c.id = u.candidato_id AND c.slug = u.slug
     WHERE c.id IS NULL)
  THEN RAISE EXCEPTION 'l8-mesa: identidade de ficha divergente'; END IF;

  IF EXISTS (SELECT 1 FROM public.processos p JOIN (
       SELECT numero_cnj FROM _pf_processos_curadoria UNION SELECT numero_cnj FROM _pf_l8_processos_cnj) l
     ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g'))
  THEN RAISE EXCEPTION 'l8-mesa: CNJ do lote já existe em produção; recusar duplicação ou lote parcial'; END IF;

  IF (SELECT count(*) FROM public.processos p JOIN _pf_l8_processos_cnj u
        ON u.processo_id = p.id AND u.candidato_id = p.candidato_id
      WHERE p.numero_processo IS NULL AND md5(to_jsonb(p)::text) = u.preimage_md5) <> 6
     OR (SELECT count(*) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos u
        ON u.id = e.id AND u.candidato_id = e.candidato_id
      WHERE md5(to_jsonb(e)::text) = u.preimage_md5
        AND e.relacao IN ('sustenta', 'relacionada')
        AND ((u.acao = 'verificar' AND NOT e.verificado)
          OR (u.acao = 'despublicar' AND public.is_public_compromisso_evidencia(e.id)))) <> 11
     OR (SELECT count(*) FROM public.projetos_lei p JOIN _pf_l8_autoria u
        ON u.id = p.id AND u.candidato_id = p.candidato_id
      WHERE md5(to_jsonb(p)::text) = u.preimage_md5 AND p.tipo = 'PEC' AND p.despublicado_em IS NULL) <> 1
  THEN RAISE EXCEPTION 'l8-mesa: preimagem divergiu'; END IF;

  IF EXISTS (SELECT 1 FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos_novos u
       ON e.programa_chave = u.programa_chave AND e.frase_id IS NULL AND e.tema_id = u.tema_id
      AND e.tipo_evidencia = u.tipo_evidencia AND e.evidencia_ref = u.evidencia_ref)
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260929020000')
  THEN RAISE EXCEPTION 'l8-mesa: vínculo novo ou recibo já existe'; END IF;

  INSERT INTO _pf_l8_antes
  SELECT 'processos', p.id, to_jsonb(p) FROM public.processos p JOIN _pf_l8_processos_cnj u ON u.processo_id = p.id
  UNION ALL
  SELECT 'compromisso_evidencia', e.id, to_jsonb(e) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos u ON u.id = e.id
  UNION ALL
  SELECT 'projetos_lei', p.id, to_jsonb(p) FROM public.projetos_lei p JOIN _pf_l8_autoria u ON u.id = p.id;

  -- Processos novos, um statement por CNJ.
  -- @write tabela=processos slug=alvaro-dias-rn campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'alvaro-dias-rn' AND l.numero_cnj = '0834444-65.2019.8.20.5001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=david-almeida campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'david-almeida' AND l.numero_cnj = '0733188-83.2022.8.04.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=douglas-ruas campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'douglas-ruas' AND l.numero_cnj = '0816373-64.2024.8.19.0087';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=eduardo-paes campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'eduardo-paes' AND l.numero_cnj = '0962726-74.2023.8.19.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=felipe-camarao campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'felipe-camarao' AND l.numero_cnj = '0818103-61.2026.8.10.0000';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=gabriel-azevedo campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'gabriel-azevedo' AND l.numero_cnj = '5196901-38.2023.8.13.0024';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=jhc campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'jhc' AND l.numero_cnj = '0760129-22.2025.8.02.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=laurez-moreira campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'laurez-moreira' AND l.numero_cnj = '0012601-54.2026.8.27.2700';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=laurez-moreira campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'laurez-moreira' AND l.numero_cnj = '0024560-32.2026.8.27.2729';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=luciano-zucco campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'luciano-zucco' AND l.numero_cnj = '5230719-57.2025.8.21.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=lula campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'lula' AND l.numero_cnj = '5035251-02.2023.4.03.6100';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=marconi-perillo campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'marconi-perillo' AND l.numero_cnj = '5107881-05.2019.8.09.0051';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=marconi-perillo campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'marconi-perillo' AND l.numero_cnj = '5455799-63.2018.8.09.0051';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=professora-dorinha campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'professora-dorinha' AND l.numero_cnj = '0051353-42.2025.8.27.2729';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=rafael-fonteles campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'rafael-fonteles' AND l.numero_cnj = '0831944-06.2025.8.18.0140';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=requiao-filho campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'requiao-filho' AND l.numero_cnj = '0018945-77.2024.8.16.0000';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=requiao-filho campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'requiao-filho' AND l.numero_cnj = '0071998-41.2022.8.16.0000';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=roberto-cidade campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'roberto-cidade' AND l.numero_cnj = '0013401-70.2025.8.04.9001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tarcisio-gov-sp campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tarcisio-gov-sp' AND l.numero_cnj = '2052422-44.2025.8.26.0000';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-100002537338 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-100002537338' AND l.numero_cnj = '0754385-08.2025.8.07.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-110002544986 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-110002544986' AND l.numero_cnj = '0000029-41.1998.8.16.0053';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-120002547434 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-120002547434' AND l.numero_cnj = '0754389-79.2024.8.07.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-200002534448 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-200002534448' AND l.numero_cnj = '0806004-06.2026.8.20.5004';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-200002534448 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-200002534448' AND l.numero_cnj = '0808034-14.2026.8.20.5004';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-20002553727 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-20002553727' AND l.numero_cnj = '0016830-09.1999.8.07.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-230002533586 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-230002533586' AND l.numero_cnj = '0814999-49.2018.8.23.0010';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-230002533586 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-230002533586' AND l.numero_cnj = '0842579-44.2024.8.23.0010';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-230002549330 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-230002549330' AND l.numero_cnj = '1000060-07.2023.8.23.0010';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-50002536317 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-50002536317' AND l.numero_cnj = '0319830-75.2011.8.05.0001';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-80002552373 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-80002552373' AND l.numero_cnj = '0005122-65.2015.8.08.0035';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  -- @write tabela=processos slug=tse-2026-90002541455 campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = 'tse-2026-90002541455' AND l.numero_cnj = '0218716-49.1999.8.09.0051';
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;
  IF soma <> 31 THEN RAISE EXCEPTION 'l8-mesa: processos inseridos %', soma; END IF;

  -- @write tabela=processos ref=curadoria-mesa-l8-20260929 campos=numero_processo,status
  UPDATE public.processos p SET numero_processo = u.numero_cnj,
    status = COALESCE(u.status_novo, p.status)
  FROM _pf_l8_processos_cnj u
  WHERE p.id = u.processo_id AND p.candidato_id = u.candidato_id
    AND u.lote = 'curadoria-mesa-l8-20260929' AND md5(to_jsonb(p)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'l8-mesa: CNJs completados %', n; END IF;

  -- @write tabela=coleta_log ref=migration:20260929020000 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'processos-curadoria', 'candidato', r.slug, r.candidato_id, 'encontrado', r.volume,
         r.detalhe, r.url, 'migration:20260929020000', 'coleta'
  FROM _pf_l8_recibos r JOIN public.candidatos c ON c.id = r.candidato_id AND c.slug = r.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 26 THEN RAISE EXCEPTION 'l8-mesa: recibos de processos %', n; END IF;

  -- @write tabela=compromisso_evidencia ref=curadoria-mesa-l8-20260929 campos=verificado,revisado_por,revisado_em,motivo,updated_at
  UPDATE public.compromisso_evidencia e SET verificado = true, revisado_por = 'curadoria-mesa-l8-20260929',
    revisado_em = v, motivo = 'Mesa L8 de 29/09/2026: vínculo publicado como "Trata do tema" após revisão editorial.', updated_at = v
  FROM _pf_l8_vinculos u
  WHERE u.acao = 'verificar' AND e.id = u.id AND e.candidato_id = u.candidato_id
    AND md5(to_jsonb(e)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'l8-mesa: vínculos verificados %', n; END IF;

  -- @write tabela=compromisso_evidencia ref=curadoria-mesa-l8-20260929 campos=verificado,revisado_por,revisado_em,motivo,updated_at
  UPDATE public.compromisso_evidencia e SET verificado = false, revisado_por = 'curadoria-mesa-l8-20260929',
    revisado_em = v, motivo = 'Mesa L8 de 29/09/2026: vínculo retirado da ficha após revisão editorial.', updated_at = v
  FROM _pf_l8_vinculos u
  WHERE u.acao = 'despublicar' AND e.id = u.id AND e.candidato_id = u.candidato_id
    AND md5(to_jsonb(e)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 10 THEN RAISE EXCEPTION 'l8-mesa: vínculos retirados %', n; END IF;

  -- @write tabela=compromisso_evidencia ref=curadoria-mesa-l8-20260929 campos=candidato_id,programa_chave,frase_id,tema_id,tipo_evidencia,evidencia_ref,relacao,origem,probabilidade,verificado,revisado_por,revisado_em,motivo
  INSERT INTO public.compromisso_evidencia
    (candidato_id, programa_chave, frase_id, tema_id, tipo_evidencia, evidencia_ref,
     relacao, origem, probabilidade, verificado, revisado_por, revisado_em, motivo)
  SELECT u.candidato_id, u.programa_chave, NULL, u.tema_id, u.tipo_evidencia, u.evidencia_ref,
         'relacionada', 'curadoria', NULL, true, 'curadoria-mesa-l8-20260929', v, 'Mesa L8 de 29/09/2026: vínculo publicado como "Trata do tema" após revisão editorial.'
  FROM _pf_l8_vinculos_novos u JOIN public.candidatos c ON c.id = u.candidato_id AND c.slug = u.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'l8-mesa: vínculos inseridos %', n; END IF;

  -- @write tabela=projetos_lei ref=curadoria-mesa-l8-20260929 campos=metadata
  UPDATE public.projetos_lei p SET metadata = COALESCE(p.metadata, '{}'::jsonb)
    || jsonb_build_object('autoria', jsonb_build_object('papel', u.papel, 'ordem', u.ordem, 'total', u.total,
         'fonte', 'Câmara dos Deputados, Dados Abertos', 'revisado_em', '2026-09-29',
         'lote', 'curadoria-mesa-l8-20260929'))
  FROM _pf_l8_autoria u
  WHERE p.id = u.id AND p.candidato_id = u.candidato_id AND md5(to_jsonb(p)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'l8-mesa: autoria %', n; END IF;

  -- Pós-condição: o que a ficha passa a mostrar.
  IF (SELECT count(*) FROM _pf_processos_curadoria l WHERE (SELECT count(*) FROM public.processos p
        WHERE p.candidato_id = l.candidato_id AND p.fonte = l.fonte
          AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')) <> 1) <> 0
     OR (SELECT count(*) FROM public.processos p JOIN _pf_l8_processos_cnj u ON u.processo_id = p.id
        WHERE p.numero_processo = u.numero_cnj AND (u.status_novo IS NULL OR p.status = u.status_novo)) <> 6
     OR (SELECT count(*) FROM _pf_l8_vinculos u WHERE u.acao = 'verificar' AND public.is_public_compromisso_evidencia(u.id)) <> 1
     OR (SELECT count(*) FROM _pf_l8_vinculos u WHERE u.acao = 'despublicar' AND NOT public.is_public_compromisso_evidencia(u.id)) <> 10
     OR (SELECT count(*) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos_novos u
        ON e.programa_chave = u.programa_chave AND e.frase_id IS NULL AND e.tema_id = u.tema_id
       AND e.tipo_evidencia = u.tipo_evidencia AND e.evidencia_ref = u.evidencia_ref
        WHERE public.is_public_compromisso_evidencia(e.id)) <> 6
     OR (SELECT count(*) FROM public.projetos_lei p JOIN _pf_l8_autoria u ON u.id = p.id
        WHERE p.metadata->'autoria'->>'papel' = u.papel AND (p.metadata->'autoria'->>'ordem')::int = u.ordem) <> 1
  THEN RAISE EXCEPTION 'l8-mesa: pós-condição falhou'; END IF;

  -- @write tabela=coleta_log ref=migration:20260929020000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'curadoria-l8-mesa', 'global', 'processos,compromisso_evidencia,projetos_lei', 'encontrado',
    55,
    jsonb_build_object(
      'resumo', 'Mesa L8: 31 processos novos, 6 CNJs completados, 7 vínculos de promessa publicados, 10 retirados e 1 autoria corrigida.',
      'processos_novos', (SELECT jsonb_agg(jsonb_build_object('slug', l.slug, 'numero_processo', l.numero_cnj) ORDER BY l.slug, l.numero_cnj) FROM _pf_processos_curadoria l),
      'vinculos_novos', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos_novos u
        ON e.programa_chave = u.programa_chave AND e.frase_id IS NULL AND e.tema_id = u.tema_id
       AND e.tipo_evidencia = u.tipo_evidencia AND e.evidencia_ref = u.evidencia_ref),
      'linhas', (SELECT jsonb_agg(jsonb_build_object('tabela', a.tabela, 'id', a.id, 'before', a.antes, 'after', CASE a.tabela
          WHEN 'processos' THEN (SELECT to_jsonb(p) FROM public.processos p WHERE p.id = a.id)
          WHEN 'compromisso_evidencia' THEN (SELECT to_jsonb(e) FROM public.compromisso_evidencia e WHERE e.id = a.id)
          ELSE (SELECT to_jsonb(p) FROM public.projetos_lei p WHERE p.id = a.id) END) ORDER BY a.tabela, a.id)
        FROM _pf_l8_antes a))::text,
    'https://comunica.pje.jus.br/', 'migration:20260929020000', 'escrita';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'l8-mesa: recibo global %', n; END IF;
END
$apply$;
COMMIT;
