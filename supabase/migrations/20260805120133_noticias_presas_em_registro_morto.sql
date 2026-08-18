-- Notícias presas em registro despublicado voltam para a ficha viva.
-- Aprovada pelo mantenedor em 05/08/2026.
--
-- ORIGEM
--
-- Duas pessoas têm dois registros no banco: o da pré-candidatura presidencial,
-- hoje `status = 'removido'` e `publicavel = false`, e o da disputa estadual,
-- que é a ficha no ar. A ingestão de notícias rodou nos dois em épocas
-- diferentes, e o registro morto ficou com cobertura que a ficha viva não tem:
--
--   tarcisio    (removido) -> tarcisio-gov-sp   : 101 linhas, 86 com URL que a viva não tem
--   ciro-gomes  (removido) -> ciro-gomes-gov-ce : 171 linhas, 98 com URL que a viva não tem
--
-- São 184 matérias sobre a mesma pessoa, invisíveis para o leitor porque estão
-- penduradas num registro que a superfície pública não lê. Não é dado novo nem
-- coleta nova: é cobertura que o projeto já tinha e não estava mostrando.
--
-- POR QUE UPDATE E NÃO INSERT (o ponto que decide esta migration)
--
-- `trg_candidate_change_noticias_candidato` é AFTER **INSERT** em
-- `noticias_candidato`, e alimenta `candidate_changes`, que por sua vez alimenta
-- o e-mail de digest (`src/app/api/alerts/send-digest/route.ts`, teto de 40 por
-- envio). Copiar as 184 linhas com INSERT criaria 184 mudanças novas e o próximo
-- digest anunciaria a assinante, como novidade de hoje, matéria de meses atrás.
-- Há assinante real e `candidate_changes` estava com 16.577 linhas e movimento
-- às 08:00 de hoje: o caminho é vivo, não hipotético.
--
-- Trocar o dono da linha com UPDATE resolve sem nada disso. O trigger não é de
-- UPDATE, então não dispara, e nenhum trigger precisa ser desabilitado, o que
-- também mantém intocado o trigger de `pontos_atencao` que outra sessão está
-- usando agora. O bloco de conferência no fim prova que `candidate_changes` não
-- se mexeu, comparando a contagem no início e no fim da própria transação.
--
-- DEDUPLICAÇÃO
--
-- `noticias_candidato` tem UNIQUE (candidato_id, url). O `NOT EXISTS` deixa para
-- trás exatamente as URLs que a ficha viva já tem (15 em tarcisio, 73 em
-- ciro-gomes). Essas linhas continuam no registro morto, invisíveis, e não são
-- apagadas: apagar seria destruir o histórico de qual ingestão trouxe o quê.
--
-- O `NOT EXISTS` não interfere consigo mesmo: em READ COMMITTED a subconsulta
-- enxerga o snapshot do início do statement, e além disso não há URL repetida
-- dentro de cada registro morto (86 linhas / 86 URLs distintas, 98 / 98).
BEGIN;

-- Contagem de partida, para o bloco de conferência provar que o digest não
-- ganhou linha nenhuma com esta migration.
CREATE TEMP TABLE _antes ON COMMIT DROP AS
SELECT (SELECT COUNT(*) FROM public.candidate_changes) AS mudancas,
       (SELECT COUNT(*) FROM public.noticias_candidato) AS noticias;

-- ---------------------------------------------------------------------------
-- @write tabela=noticias_candidato slug=tarcisio-gov-sp campos=candidato_id
UPDATE public.noticias_candidato n
SET candidato_id = (SELECT id FROM public.candidatos WHERE slug = 'tarcisio-gov-sp')
WHERE n.candidato_id = (SELECT id FROM public.candidatos WHERE slug = 'tarcisio')
  AND NOT EXISTS (
    SELECT 1
    FROM public.noticias_candidato viva
    WHERE viva.candidato_id = (SELECT id FROM public.candidatos WHERE slug = 'tarcisio-gov-sp')
      AND viva.url = n.url
  );

-- ---------------------------------------------------------------------------
-- @write tabela=noticias_candidato slug=ciro-gomes-gov-ce campos=candidato_id
UPDATE public.noticias_candidato n
SET candidato_id = (SELECT id FROM public.candidatos WHERE slug = 'ciro-gomes-gov-ce')
WHERE n.candidato_id = (SELECT id FROM public.candidatos WHERE slug = 'ciro-gomes')
  AND NOT EXISTS (
    SELECT 1
    FROM public.noticias_candidato viva
    WHERE viva.candidato_id = (SELECT id FROM public.candidatos WHERE slug = 'ciro-gomes-gov-ce')
      AND viva.url = n.url
  );

-- ---------------------------------------------------------------------------
-- Conferência.
DO $$
DECLARE
  tarcisio_morto integer;
  tarcisio_vivo integer;
  ciro_morto integer;
  ciro_vivo integer;
  mudancas_agora integer;
  mudancas_antes integer;
  noticias_agora integer;
  noticias_antes integer;
BEGIN
  SELECT COUNT(*) INTO tarcisio_morto FROM public.noticias_candidato n
    JOIN public.candidatos c ON c.id = n.candidato_id WHERE c.slug = 'tarcisio';
  SELECT COUNT(*) INTO tarcisio_vivo FROM public.noticias_candidato n
    JOIN public.candidatos c ON c.id = n.candidato_id WHERE c.slug = 'tarcisio-gov-sp';
  SELECT COUNT(*) INTO ciro_morto FROM public.noticias_candidato n
    JOIN public.candidatos c ON c.id = n.candidato_id WHERE c.slug = 'ciro-gomes';
  SELECT COUNT(*) INTO ciro_vivo FROM public.noticias_candidato n
    JOIN public.candidatos c ON c.id = n.candidato_id WHERE c.slug = 'ciro-gomes-gov-ce';

  -- 101 - 86 = 15 duplicadas ficam para trás; 419 + 86 = 505 na ficha viva.
  IF tarcisio_morto <> 15 OR tarcisio_vivo <> 505 THEN
    RAISE EXCEPTION 'noticias_registro_morto: tarcisio esperado 15/505, encontrado %/%',
      tarcisio_morto, tarcisio_vivo;
  END IF;

  -- 171 - 98 = 73 duplicadas ficam para trás; 302 + 98 = 400 na ficha viva.
  IF ciro_morto <> 73 OR ciro_vivo <> 400 THEN
    RAISE EXCEPTION 'noticias_registro_morto: ciro esperado 73/400, encontrado %/%',
      ciro_morto, ciro_vivo;
  END IF;

  SELECT mudancas, noticias INTO mudancas_antes, noticias_antes FROM _antes;
  SELECT COUNT(*) INTO mudancas_agora FROM public.candidate_changes;
  SELECT COUNT(*) INTO noticias_agora FROM public.noticias_candidato;

  -- O ponto da migration: trocar de dono não pode ter gerado mudança nenhuma
  -- para o digest anunciar.
  IF mudancas_agora <> mudancas_antes THEN
    RAISE EXCEPTION
      'noticias_registro_morto: candidate_changes foi de % para %; o digest anunciaria materia antiga como novidade',
      mudancas_antes, mudancas_agora;
  END IF;

  -- E nenhuma linha pode ter sido criada nem destruída: só trocaram de dono.
  IF noticias_agora <> noticias_antes THEN
    RAISE EXCEPTION 'noticias_registro_morto: total de noticias foi de % para %',
      noticias_antes, noticias_agora;
  END IF;
END $$;

COMMIT;

-- Verificação pós-aplicação (rodar manualmente):
--
--   select c.slug, count(*) from noticias_candidato n
--     join candidatos c on c.id = n.candidato_id
--    where c.slug in ('tarcisio', 'tarcisio-gov-sp', 'ciro-gomes', 'ciro-gomes-gov-ce')
--    group by c.slug order by c.slug;
--
--   select count(*) from candidate_changes where created_at > '2026-08-05 08:00:59+00';
--
-- Reversão (devolve as linhas ao registro morto, também sem disparar trigger):
--
--   update noticias_candidato set candidato_id = (select id from candidatos where slug = 'tarcisio')
--    where id in (<ids gravados na auditoria da sessão>);
--
-- PENDENTE, fora do escopo desta migration:
--   - as 88 linhas duplicadas que ficaram no registro morto (15 + 73). Só fazem
--     sentido apagar junto com uma decisão sobre o destino dos dois registros
--     despublicados inteiros, que é editorial.
