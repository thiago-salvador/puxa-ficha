-- Item 7: contrato estrutural separado da curadoria 20260811100000.
alter table public.votacoes_chave
  add constraint votacoes_chave_senado_exige_evento_exato_check
  check (
    casa is distinct from 'Senado'
    or (fonte = 'senado' and votacao_id_api is not null and btrim(votacao_id_api) <> '')
  );
