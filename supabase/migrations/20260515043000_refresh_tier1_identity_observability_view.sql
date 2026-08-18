BEGIN;

CREATE OR REPLACE VIEW public.candidatos_identidade_tier1_auditavel AS
WITH tier1_ids(slug, id_camara, id_senado, ids_tse_sq_candidato) AS (
  VALUES
    ('lula', 139289, NULL, '{"2018":"280000625869","2022":"280001607829"}'::jsonb),
    ('flavio-bolsonaro', NULL, 5894, '{"2002":"851","2006":"10354","2010":"190000000070","2014":"190000000095","2016":"190000011736","2018":"190000614721"}'::jsonb),
    ('tarcisio-gov-sp', NULL, NULL, '{"2022":"250001615967"}'::jsonb),
    ('ciro-gomes', 141406, NULL, '{"2018":"280000605589","2022":"280001612393"}'::jsonb),
    ('ronaldo-caiado', 74813, 456, '{"2018":"90000613470","2022":"90001646326"}'::jsonb),
    ('ratinho-junior', 141403, NULL, '{"2002":"492","2006":"10020","2010":"160000000790","2012":"160000019324","2014":"160000000848","2018":"160000609226","2022":"160001614467"}'::jsonb),
    ('aldo-rebelo', 73428, NULL, '{"2022":"250001639699"}'::jsonb),
    ('sergio-moro-gov-pr', NULL, 6331, '{"2022":"160001621846"}'::jsonb),
    ('geraldo-alckmin', 65480, NULL, '{"2018":"280000602477","2022":"280001607830"}'::jsonb),
    ('jorginho-mello', 160509, 5350, '{"2018":"240000609539","2022":"240001611127"}'::jsonb),
    ('nikolas-ferreira', 209787, NULL, '{"2020":"130001175469","2022":"130001611005"}'::jsonb),
    ('eduardo-paes', NULL, NULL, '{"2002":"1749","2006":"10421","2008":"395","2012":"190000004018","2018":"190000609934","2020":"190000688286","2024":"190002135253"}'::jsonb),
    ('jeronimo', NULL, NULL, '{"2020":"50001165142","2022":"100001606606"}'::jsonb),
    ('haddad-gov-sp', NULL, NULL, '{"2022":"250001612465"}'::jsonb),
    ('ricardo-nunes', NULL, NULL, '{"2012":"250000008046","2014":"250000002150","2016":"250000020813","2018":"250000604021","2020":"250000896547","2024":"250002098117"}'::jsonb)
)
SELECT
  c.id,
  c.slug,
  c.nome_urna,
  c.nome_completo,
  c.cargo_disputado,
  c.estado,
  t.id_camara,
  t.id_senado,
  t.ids_tse_sq_candidato
FROM public.candidatos c
INNER JOIN tier1_ids t ON t.slug = c.slug;

COMMENT ON VIEW public.candidatos_identidade_tier1_auditavel IS
  'Espelho auditavel no Supabase dos IDs tier-1 canonicos (camara, senado, tse_sq_candidato) para Fluxo 1. Nao substitui a validacao nas APIs oficiais.';

COMMIT;
