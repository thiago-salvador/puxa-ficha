-- Rollback do par 20260816230000 (dados) + 20260816230100 (CHECK).
--
-- Um arquivo so, de proposito: o CHECK e os valores antigos sao incompativeis,
-- entao desfazer um sem o outro deixa o banco num estado que nao aceita escrita.
--
-- A migration e IRREVERSIVEL por conteudo: ela funde tres redacoes num valor so
-- e anula treze linhas. Depois de aplicada, `aguardando julgamento` nao diz mais
-- qual das tres grafias a linha tinha, e NULL nao diz qual `APTO [ano]` estava
-- ali. Por isso este arquivo NAO deriva o estado anterior do estado atual: ele
-- carrega o censo por slug medido em producao em 16/08/2026, imediatamente
-- antes da aplicacao, e restaura linha a linha.
--
-- Sao 220 slugs, o mesmo total que a migration escreve. As outras 76 linhas da
-- tabela (26 ja em 'aguardando julgamento', 19 em 'incerto', 31 NULL) a
-- migration nao toca, e este rollback tambem nao.
--
-- A constraint sai PRIMEIRO: os valores antigos a violam por construcao, que e
-- a razao de ela existir.
BEGIN;

ALTER TABLE public.candidatos
  DROP CONSTRAINT IF EXISTS candidatos_situacao_candidatura_dominio;


-- 108 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'registrada, aguardando julgamento'
WHERE slug IN (
    'acm-neto', 'adailton-furia', 'alexandre-kalil', 'alysson-bezerra', 'andre-marinho', 'araceli-,
    lemos', 'aroldo-felix', 'arthur-henrique', 'ataides-oliveira', 'cabo-daciolo', 'celina-leao',,
    'cicero-lucena', 'cleber-rabelo', 'clecio-luis', 'cleitinho', 'coronel-busnello', 'cyro-garcia',,
    'daniel-vilela', 'dario-barbosa', 'douglas-ruas', 'dr-furlan', 'eduardo-braide', 'eduardo-paes',,
    'eduardo-riedel', 'efraim-filho', 'elizeu-aguiar', 'elmano-de-freitas', 'emanuel-cacho',,
    'expedito-netto', 'fabio-mitidieri', 'fabio-trad', 'felipe-camarao', 'gabriel-azevedo',,
    'gabriel-souza', 'garotinho', 'gelson-merisio', 'geraldo-carvalho', 'gilberto-vasconcelos',,
    'guilherme-fonseca', 'gustavo-henrique', 'hana-ghassan', 'helder-salomao', 'henrique-areas',,
    'hildon-chaves', 'indira-xavier', 'ivan-moraes', 'jeferson-bezerra', 'jeremias-cosmo',,
    'jeronimo', 'jhc', 'joao-henrique-catan', 'joel-rodrigues', 'jorginho-mello', 'jose-estevao',,
    'jose-roberto-arruda', 'juliana-brizola', 'juliete-pantoja', 'laurez-moreira', 'leandro-grass',,
    'lenilda-luna', 'lourdes-melo', 'luan-monteiro', 'lucas-ribeiro', 'lucia-santos', 'luciano-,
    zucco', 'lucien-rezende', 'luis-cesar-bueno', 'marcelo-brigadeiro', 'marcelo-maranata',,
    'marconi-perillo', 'marcos-rogerio', 'marcus-sodre', 'maria-do-carmo', 'mateus-simoes',,
    'natasha-slhessarenko', 'omar-aziz', 'orleans-brandao', 'otaviano-pivetta', 'pablo-marcal',,
    'patrus-ananias', 'paula-belmonte', 'pazolini', 'priscila-voigt', 'professora-dorinha', 'rafael-,
    duda', 'rafael-fonteles', 'ralf-zimmer', 'raquel-lyra', 'ravenna-castro', 'rejane-oliveira',,
    'requiao-filho', 'ricardo-ferraco', 'ricardo-marques', 'roberio-paulino', 'roberto-cidade',,
    'samara-mineiro', 'samuel-costa', 'sandro-alex', 'saulo-arcangeli', 'sergio-moro-gov-pr',,
    'serley-leal', 'tulio-lopes', 'valmir-de-francisquinho', 'vicentinho-junior', 'wellington-,
    fagundes', 'wilder-morais', 'william-siri', 'ze-batista'
);

-- 79 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'pre-candidato'
WHERE slug IN (
    'aldo-rebelo', 'alessandra-campelo', 'alex-pucineli', 'alexandre-curi', 'alvaro-dias-rn',,
    'amelio-cayres', 'anderson-ferreira', 'andre-do-prado', 'andre-kamai', 'andre-luis', 'baba',,
    'ben-mendes', 'cadu-xavier', 'camila-falcao', 'carlos-brandao-ma-historico', 'catherine-teles',,
    'cintia-dias', 'ciro-gomes', 'daniela-paiva', 'david-almeida', 'dr-daniel', 'dr-fernando-,
    maximo', 'dr-helton-monteiro', 'edegar-pretto', 'edilson-damiao', 'elisson-ferreira', 'enilton-,
    rodrigues', 'francisco-jurity', 'gilson-machado', 'gisvaldo-oliveira', 'guilherme-derrite',,
    'guto-silva', 'huggo-leonardo', 'ismar-marques', 'izalci-lucas', 'janaina-riva', 'jarbas-,
    soares', 'jarir-pereira', 'jesus-rodrigues', 'joao-campos', 'joao-rodrigues', 'joao-roma',,
    'kiko-caputo', 'lahesio-bonfim', 'lais-chaud', 'larissa-rosado', 'luciana-gurgel', 'luiz-,
    franca', 'marcelo-maluf', 'maria-da-consolacao', 'mauricio-tonha', 'naf-nascimento', 'olimpio-,
    rocha', 'paulo-martins-gov-pr', 'paulo-serra', 'pedro-abib', 'preta-lu', 'priscila-felizola',,
    'prof-enfermeira-kaelly', 'prof-meire-reis', 'rafael-luz', 'rafaell-milas', 'renan-filho',,
    'renan-hallais', 'renato-gomes', 'ricardo-cappelli', 'ricardo-frota', 'ricardo-leite', 'roberto-,
    claudio', 'santiago-belizario', 'tadeu-de-souza', 'telemaco-brandao', 'teresa-surita', 'thiago-,
    de-joaldo', 'vittorio-medioli', 'washington-bandeira', 'witer-naves', 'yuri-ezequiel', 'ze-coca'
);

-- 17 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'pedido de registro no TSE; situação não informada no snapshot'
WHERE slug IN (
    'alexandre-salomao', 'ariel-capistrano', 'arinalda-do-mlb', 'carlos-cley', 'du-pereira',,
    'eduardo-girao', 'farah-mesquita', 'francisco-dias', 'geraldo-alckmin', 'luiz-carlos-teodoro',,
    'pedro-brito', 'rafael-greca', 'raquel-bricio', 'reginaldo-lima', 'rodrigo-bolsonaro', 'samuel-,
    de-mattos', 'subtenente-luiz-carlos'
);

-- 8 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'APTO [2022]'
WHERE slug IN (
    'da-vitoria', 'joao-capiberibe', 'marcio-franca', 'nikolas-ferreira', 'rodrigo-bacellar',,
    'silvio-mendes', 'soldado-sampaio', 'tarcisio-motta'
);

-- 3 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'APTO [2020]'
WHERE slug IN (
    'arnaldinho-borgo', 'rodrigo-pacheco', 'sergio-vidigal'
);

-- 3 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'deferido'
WHERE slug IN (
    'ciro-gomes-gov-ce', 'robson-raymundo', 'ronaldo-mansur'
);

-- 1 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'INAPTO [2022]'
WHERE slug IN (
    'washington-reis'
);

-- 1 linha(s) de volta para o valor original.
UPDATE public.candidatos
SET situacao_candidatura = 'desistente'
WHERE slug IN (
    'wilson-witzel'
);


DO $$
DECLARE restauradas integer; sobrou integer;
BEGIN
  SELECT COUNT(*) INTO restauradas FROM public.candidatos
   WHERE situacao_candidatura IN (
     'registrada, aguardando julgamento', 'pre-candidato',
     'pedido de registro no TSE; situação não informada no snapshot',
     'APTO [2022]', 'APTO [2020]', 'deferido', 'INAPTO [2022]', 'desistente'
   );
  -- No replay a partir de banco vazio nem todos os 220 slugs existem; a guarda
  -- so cobra o total exato quando a tabela tem a forma de producao.
  IF (SELECT COUNT(*) FROM public.candidatos) = 296 AND restauradas <> 220 THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: esperava 220 linhas restauradas, encontrou %', restauradas;
  END IF;

  SELECT COUNT(*) INTO sobrou FROM public.candidatos
   WHERE situacao_candidatura = 'candidatura declarada';
  IF sobrou <> 0 THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: sobraram % linha(s) em candidatura declarada', sobrou;
  END IF;
END $$;

COMMIT;
