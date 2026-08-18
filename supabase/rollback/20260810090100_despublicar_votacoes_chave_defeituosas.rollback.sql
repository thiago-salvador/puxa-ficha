-- Rollback de 20260810090100: NÃO É REVERSÍVEL, e o arquivo existe para dizer
-- isso em vez de fingir que é.
--
-- A migration apaga 6 linhas de votacoes_chave e os 100 pares de
-- votos_candidato delas. Os pares não são reconstruíveis por SQL: eles vieram
-- de coleta na Câmara Dados Abertos, e a coleta que os produziu era justamente
-- a defeituosa, casando por proposição. Recriar as linhas com os mesmos uuids
-- devolveria votações vazias, não os votos.
--
-- Para desfazer de verdade: restaurar do backup do banco anterior à aplicação,
-- ou reexecutar a coleta ANTIGA, que é exatamente o que esta frente remove.
--
-- Por isso a migration 20260810090100 só deve ser aplicada depois de backup
-- confirmado, e a autorização precisa nomear o ato.

do $$
begin
  raise exception 'rollback de 20260810090100 nao e possivel por SQL: restaurar do backup. Ver o comentario deste arquivo.';
end $$;
