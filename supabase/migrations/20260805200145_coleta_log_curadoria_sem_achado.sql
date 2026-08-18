alter table public.coleta_log
  drop constraint if exists coleta_log_resultado_check;

alter table public.coleta_log
  add constraint coleta_log_resultado_check check (
    resultado in (
      'encontrado',
      'vazio_confirmado',
      'sem_achado_no_escopo',
      'nao_aplicavel',
      'erro',
      'indeterminado'
    )
  );

alter table public.coleta_log
  drop constraint if exists coleta_log_volume_coerente;

alter table public.coleta_log
  add constraint coleta_log_volume_coerente check (
    case resultado
      when 'encontrado'             then volume > 0
      when 'vazio_confirmado'       then volume = 0
      when 'sem_achado_no_escopo'   then volume = 0
      when 'nao_aplicavel'          then volume = 0
      when 'indeterminado'          then volume = 0
      else true
    end
  );

comment on column public.coleta_log.resultado is
  'Desfecho da tentativa. sem_achado_no_escopo registra curadoria concluída sem achado no recorte declarado em detalhe; não prova ausência absoluta.';
