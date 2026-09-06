DO $rollback$
BEGIN
  RAISE EXCEPTION 'rollback indisponível: expurgo de retenção não preserva conteúdo vencido';
END
$rollback$;
