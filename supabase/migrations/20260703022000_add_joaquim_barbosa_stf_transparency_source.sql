BEGIN;

UPDATE public.candidatos
SET
  fonte_dados = CASE
    WHEN fonte_dados @> ARRAY[
      'https://www.stf.jus.br/arquivo/cms/centralDoCidadaoAcessoInformacaoRemuneracao/anexo/planilhaRemuneracaoMinistroAtivo.pdf'
    ]::text[] THEN fonte_dados
    ELSE array_append(
      COALESCE(fonte_dados, ARRAY[]::text[]),
      'https://www.stf.jus.br/arquivo/cms/centralDoCidadaoAcessoInformacaoRemuneracao/anexo/planilhaRemuneracaoMinistroAtivo.pdf'
    )
  END,
  ultima_atualizacao = now()
WHERE slug = 'joaquim-barbosa';

COMMIT;
