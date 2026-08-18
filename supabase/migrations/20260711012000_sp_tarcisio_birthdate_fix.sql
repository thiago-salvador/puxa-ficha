-- Correct Tarcisio de Freitas birth date from the official TSE 2022 candidacy record.
update public.candidatos
set data_nascimento = date '1975-06-19',
    fonte_dados = coalesce(fonte_dados, '{}'::text[]) || array['TSE consulta_cand 2022 SQ 250001615967'],
    ultima_atualizacao = now()
where slug = 'tarcisio-gov-sp';
