BEGIN;

-- Decisão editorial de Thiago Salvador em 05/08/2026: 20 biografias
-- aprovadas sem edição, uma a uma, na sessão local
-- `aprovacao-editorial-biografias-2026-08-05`.
--
-- O texto e a fonte de cada frase foram reconferidos antes da decisão. O
-- documento imutável no commit que originou a sessão preserva as anotações e
-- as lacunas que deliberadamente ficaram fora das biografias.

CREATE TEMP TABLE approved_biographies_20260805 ON COMMIT DROP AS
SELECT *
  FROM (VALUES
  ('aroldo-felix', 'Aroldo Felix de Azevedo Junior nasceu em 16 de dezembro de 1982, na Paraíba. Declarou ao TSE a profissão de professor de ensino superior. Em 2022 foi candidato ao governo de Sergipe pela Unidade Popular (UP) e não foi eleito. Em julho de 2026 a UP o lançou como candidato ao governo da Bahia, em convenção. Em entrevista, defendeu a integração das forças de segurança e propôs creches municipais e um programa de reeducação policial.', 'Fontes por frase (aroldo-felix): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('carlos-machado', 'Carlos Machado foi oficializado candidato ao governo de São Paulo pelo PCB em convenção realizada no início de agosto de 2026.', 'Fontes por frase (carlos-machado): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('catherine-teles', 'Catherine Morais Teles nasceu em 12 de julho de 1992, no Ceará. É candidata a vice-governadora do Ceará pela Unidade Popular (UP) na eleição de 2026, com registro protocolado no TSE.', 'Fontes por frase (catherine-teles): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('daniela-paiva', 'Daniela Paiva de Oliveira nasceu em 23 de dezembro de 1982, no Acre. Declarou ao TSE a ocupação de ocupante de cargo em comissão. Foi candidata a deputada federal pelo Acre em 2018, pelo PSL, e não foi eleita. Em 2020 foi candidata a vereadora no Acre pelo MDB e ficou como suplente. Registrou-se em 2026 como candidata a vice-governadora do Acre pelo AGIR, terceiro partido pelo qual disputa uma eleição.', 'Fontes por frase (daniela-paiva): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('dr-luisinho', 'Francisco das Chagas Conceição da Silva, com nome de urna "Dr. Luisinho", nasceu em 16 de janeiro de 1975, no Acre. Declarou ao TSE a profissão de empresário. Em 2020 foi candidato a vereador no Amazonas pelo PTB e ficou como suplente. Em 2026 o AGIR o lançou como candidato ao governo do Acre. Foi um dos primeiros a registrar candidatura ao governo do Acre no TSE, junto com Alan Rick.', 'Fontes por frase (dr-luisinho): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('elisson-ferreira', 'Elisson Ferreira foi lançado candidato ao governo do Distrito Federal pelo AGIR em julho de 2026, em evento que também apresentou Tiago Társis como candidato ao Senado.', 'Fontes por frase (elisson-ferreira): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('gilberto-vasconcelos', 'Gilberto Vasconcelos da Silva nasceu em 15 de abril de 1967, em Manaus (AM). Declarou ao TSE a profissão de professor de ensino fundamental. Disputou eleições pelo PSTU desde 2010: deputado federal (2010), vereador (2012), vice-governador (2014) e prefeito (2020), sempre no Amazonas, sem se eleger. Em julho de 2026 o PSTU oficializou sua candidatura ao governo do Amazonas, em chapa com Juliana Frota.', 'Fontes por frase (gilberto-vasconcelos): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('guilherme-fonseca', 'Guilherme Fonseca foi lançado pré-candidato ao governo de Pernambuco pelo PSTU em junho de 2026. Em 25 de julho de 2026 o partido confirmou a candidatura em convenção no Recife.', 'Fontes por frase (guilherme-fonseca): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('jose-estevao', 'José Estêvão dos Santos Barbosa teve a pré-candidatura ao governo da Bahia lançada pela Democracia Cristã (DC) em abril de 2026, em evento com apoio de Aldo Rebelo. Em julho de 2026 voltou ao comando do partido na Bahia. No início de agosto o partido o lançou candidato ao governo da Bahia. A candidatura é objeto de disputa interna: a imprensa registrou dois lançamentos concorrentes pela mesma sigla, o dele e o de Ariel Capistrano.', 'Fontes por frase (jose-estevao): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('lenilda-luna', 'Lenilda Luna de Almeida nasceu em 4 de outubro de 1966, em Cabo de Santo Agostinho (PE). Declarou ao TSE a profissão de jornalista e redatora. Pela Unidade Popular (UP), foi candidata a prefeita em 2020, a deputada federal em 2022 e a prefeita em 2024, em Alagoas, sem se eleger. Em julho de 2026 a UP oficializou sua candidatura ao governo de Alagoas em convenção. À época da convenção, era a única mulher na disputa pelo governo de Alagoas.', 'Fontes por frase (lenilda-luna): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('naf-nascimento', 'Naftaly Pereira do Nascimento, com nome de urna "Naf Nascimento", nasceu em 3 de março de 1994, no Piauí. Declarou ao TSE a profissão de jornalista e redatora. É candidata a vice-governadora do Rio Grande do Sul pela Unidade Popular (UP), com registro protocolado no TSE, e foi apresentada pelo partido na cobertura da imprensa local.', 'Fontes por frase (naf-nascimento): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('preta-lu', 'Luciana Costa Correa, com nome de urna "Preta Lu", nasceu em 5 de julho de 1981, em São Luís (MA). Declarou ao TSE a profissão de artesã. Pelo PSTU, foi candidata a vereadora em 2016, a senadora em 2018 e a vereadora em 2020, no Maranhão, sem se eleger. Em 2022 foi candidata a deputada federal pelo Maranhão e recebeu 1.105 votos nominais, sem se eleger. Em julho de 2026 a convenção do PSTU oficializou sua candidatura a vice-governadora na chapa de Saulo Arcangeli.', 'Fontes por frase (preta-lu): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('priscila-felizola', 'Priscila Dias Silva Felizola nasceu em 18 de janeiro de 1982, em Sergipe. Declarou ao TSE a profissão de advogada. Em abril de 2026 filiou-se ao Republicanos. Em junho de 2026 foi confirmada pré-candidata a vice-governadora de Sergipe na chapa de Valmir de Francisquinho.', 'Fontes por frase (priscila-felizola): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('prof-enfermeira-kaelly', 'Kaelly Virginia de Oliveira Saraiva, com nome de urna "Prof. Enfermeira Kaelly", nasceu em 5 de janeiro de 1970, no Ceará. Declarou ao TSE a profissão de professora de ensino superior. Em 2020 foi candidata a prefeita pelo PSOL em Mato Grosso do Sul e não foi eleita. É candidata a vice-governadora de Mato Grosso do Sul pelo PSOL na eleição de 2026, com registro protocolado no TSE.', 'Fontes por frase (prof-enfermeira-kaelly): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('prof-meire-reis', 'Meire Lucia Alves dos Reis nasceu em 9 de novembro de 1970, em Salvador (BA). Declarou ao TSE a profissão de servidora pública estadual. Em 2012 foi candidata a vereadora pelo PSOL na Bahia e ficou como suplente. É candidata a vice-governadora da Bahia pelo PSOL em 2026; em entrevistas, afirmou que a candidatura amplia a presença feminina no poder e comentou o crescimento do partido no estado.', 'Fontes por frase (prof-meire-reis): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('ricardo-leite', 'Fabio Ricardo Leite nasceu em 10 de maio de 1967, em Jales (SP). Declarou ao TSE a profissão de empresário; a imprensa local o descreve como empresário do setor de educação, conhecido como "Rico". Em julho de 2026 foi oficializado candidato a vice-governador do Acre na chapa de Alan Rick. Declarou ao TSE bens de R$ 45 milhões.', 'Fontes por frase (ricardo-leite): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('robson-raymundo', 'Robson Raymundo da Silva nasceu em 12 de abril de 1970, no Rio de Janeiro (RJ). Declarou ao TSE a profissão de professor de ensino médio. Pelo PSTU, foi candidato ao Senado pelo Distrito Federal em 2010, 2014 e 2018, e ao governo do Distrito Federal em 2022, sem se eleger. Em 2026 o PSTU o lançou novamente candidato ao governo do Distrito Federal.', 'Fontes por frase (robson-raymundo): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('saulo-arcangeli', 'Saulo Costa Arcangeli nasceu em 25 de outubro de 1971, em São Luís (MA). Declarou ao TSE a profissão de professor de ensino superior. Disputou sete eleições entre 2010 e 2022, sempre no Maranhão: governo (2010, pelo PSOL; 2014), Câmara de Vereadores (2012, 2016, 2020) e Senado (2018, 2022), as seis últimas pelo PSTU, sem se eleger. Em julho de 2026 a convenção do PSTU oficializou sua candidatura ao governo do Maranhão, em chapa com Preta Lu. Foi o primeiro candidato ao governo do Maranhão a registrar candidatura no TSE em 2026, declarando patrimônio de R$ 656,4 mil.', 'Fontes por frase (saulo-arcangeli): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('washington-bandeira', 'Francisco Washington Bandeira Santos Filho nasceu em 23 de outubro de 1984, no Piauí. Declarou ao TSE a profissão de advogado. Em julho de 2026 foi homologado candidato a vice-governador do Piauí na convenção da base governista, integrando a chapa de Rafael Fonteles. Em agosto de 2026 participou do 1º Fórum de Vice-Prefeitos do Piauí, onde defendeu o municipalismo.', 'Fontes por frase (washington-bandeira): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md'),
  ('yuri-ezequiel', 'Yuri Ezequiel foi lançado candidato ao governo da Paraíba pela Unidade Popular (UP) em julho de 2026. Em entrevistas, defendeu o fortalecimento das empresas públicas e disse se colocar contra o que chamou de "ciclo de oligarquias" no estado. Afirmou que a UP teria uma mulher como pré-candidata a vice na chapa.', 'Fontes por frase (yuri-ezequiel): https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md')) AS approved(slug, biografia, fonte_ref);

DO $$
DECLARE
  total_aprovado integer;
  total_elegivel integer;
BEGIN
  SELECT count(*) INTO total_aprovado FROM approved_biographies_20260805;
  IF total_aprovado <> 20 THEN
    RAISE EXCEPTION 'Esperadas 20 biografias aprovadas, encontradas %', total_aprovado;
  END IF;

  SELECT count(*)
    INTO total_elegivel
    FROM public.candidatos c
    JOIN approved_biographies_20260805 a USING (slug)
   WHERE c.publicavel IS TRUE
     AND c.biografia IS NULL;

  IF total_elegivel <> 20 THEN
    RAISE EXCEPTION 'Pré-condição editorial mudou: esperadas 20 fichas publicáveis sem biografia, encontradas %', total_elegivel;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.coleta_log
     WHERE fonte = 'curadoria-biografia'
       AND execucao = 'editorial:biografias-20260805'
  ) THEN
    RAISE EXCEPTION 'Já existe rastro da execução editorial:biografias-20260805';
  END IF;
END
$$;

-- @write tabela=candidatos ref=editorial:biografias-20260805 campos=biografia,fonte_dados,ultima_atualizacao
UPDATE public.candidatos c
   SET biografia = a.biografia,
       fonte_dados = ARRAY(
         SELECT DISTINCT fonte
           FROM unnest(
             coalesce(c.fonte_dados, '{}'::text[])
             || ARRAY[a.fonte_ref, 'editorial:biografias-20260805']
           ) AS fonte
          ORDER BY fonte
       ),
       ultima_atualizacao = now()
  FROM approved_biographies_20260805 a
 WHERE c.slug = a.slug;

-- Uma linha por ficha aprovada. O volume 1 representa a biografia gravada, não
-- o número de frases nem o número de fontes consultadas.
-- @write tabela=coleta_log ref=editorial:biografias-20260805 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'curadoria-biografia',
       'candidato',
       c.slug,
       c.id,
       'encontrado',
       1,
       'Biografia aprovada sem edição por Thiago Salvador em sessão item a item; fonte de cada frase no documento vinculado.',
       'https://github.com/thiago-salvador/puxa-ficha-oss/blob/0f27d012ac3fd094caee61a51f72fb8743d45f59/docs/rascunhos-biografias-20-novos-2026-08-05.md',
       'editorial:biografias-20260805'
  FROM public.candidatos c
  JOIN approved_biographies_20260805 a USING (slug);

DO $$
DECLARE
  total_biografias integer;
  total_fontes integer;
  total_rastros integer;
BEGIN
  SELECT count(*)
    INTO total_biografias
    FROM public.candidatos c
    JOIN approved_biographies_20260805 a USING (slug)
   WHERE c.biografia = a.biografia;

  SELECT count(*)
    INTO total_fontes
    FROM public.candidatos c
    JOIN approved_biographies_20260805 a USING (slug)
   WHERE a.fonte_ref = ANY (c.fonte_dados);

  SELECT count(*)
    INTO total_rastros
    FROM public.coleta_log
   WHERE fonte = 'curadoria-biografia'
     AND execucao = 'editorial:biografias-20260805';

  IF total_biografias <> 20 OR total_fontes <> 20 OR total_rastros <> 20 THEN
    RAISE EXCEPTION 'Pós-condição falhou: biografias %, fontes %, rastros %', total_biografias, total_fontes, total_rastros;
  END IF;
END
$$;

COMMIT;
