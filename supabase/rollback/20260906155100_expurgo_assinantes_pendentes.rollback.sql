DO $rollback$
BEGIN
  RAISE EXCEPTION 'rollback indisponível: expurgo de dados pessoais não preserva emails vencidos';
END
$rollback$;
