-- Identidade das inclusoes de 20260803121034. Sem isto a ficha sai sem idade,
-- porque `public.candidatos_publico` deriva idade de data_nascimento.
--
-- PROVENIENCIA, campo a campo, toda do TSE:
--   lenilda-luna      DivulgaCandContas 2022 AL, SQ 20001653097
--   aroldo-felix      DivulgaCandContas 2022 SE, SQ 260001617899
--   robson-raymundo   DivulgaCandContas 2022 DF, SQ 70001611377
--   luis-cesar-bueno  DivulgaCandContas 2022 GO, SQ 90001649536
--   saulo-arcangeli   consulta_cand 2026 MA, SQ 100002534190
--   dr-luisinho       consulta_cand 2026 AC, SQ 10002533539
--
-- saulo-arcangeli e dr-luisinho ficam SEM naturalidade de proposito: o pacote
-- consulta_cand de 2026 traz so SG_UF_NASCIMENTO, sem municipio, e "MA" ou "AC"
-- sozinho nao e naturalidade. Preenche quando o DivulgaCandContas de 2026 abrir.
-- jose-estevao fica sem nenhum destes campos: nao tem registro no TSE.

UPDATE public.candidatos SET data_nascimento='1966-10-04', naturalidade='Cabo de Santo Agostinho/PE', formacao='Superior completo', profissao_declarada='Jornalista e Redator', ultima_atualizacao=NOW() WHERE slug='lenilda-luna';

UPDATE public.candidatos SET data_nascimento='1982-12-16', naturalidade='João Pessoa/PB', formacao='Superior completo', profissao_declarada='Professor de Ensino Superior', ultima_atualizacao=NOW() WHERE slug='aroldo-felix';

UPDATE public.candidatos SET data_nascimento='1970-04-12', naturalidade='Rio de Janeiro/RJ', formacao='Superior completo', profissao_declarada='Professor de Ensino Médio', ultima_atualizacao=NOW() WHERE slug='robson-raymundo';

UPDATE public.candidatos SET data_nascimento='1960-08-11', naturalidade='Goiânia/GO', formacao='Superior completo', profissao_declarada='Servidor Público Estadual', ultima_atualizacao=NOW() WHERE slug='luis-cesar-bueno';

UPDATE public.candidatos SET data_nascimento='1971-10-25', formacao='Superior completo', profissao_declarada='Professor de Ensino Superior', ultima_atualizacao=NOW() WHERE slug='saulo-arcangeli';

UPDATE public.candidatos SET data_nascimento='1975-01-16', formacao='Superior completo', profissao_declarada='Empresário', ultima_atualizacao=NOW() WHERE slug='dr-luisinho';;
