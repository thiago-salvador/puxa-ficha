select
  count(*) as linhas,
  count(*) filter (where resultado = 'sem_achado_no_escopo') as limitadas,
  count(*) filter (where resultado = 'vazio_confirmado') as vazios_incorretos,
  count(distinct candidato_id) as fichas,
  array_agg(alvo order by alvo) as slugs
from public.coleta_log
where execucao = 'migration:20260810124000'
  and fonte = 'destaques-trajetoria';

-- Esperado após aplicação autorizada: 8 linhas, 8 limitadas, 0 vazios
-- incorretos, 8 fichas e os oito slugs do manifesto local.
