-- Rollback do backfill 20260830120000.
-- Devolve exatamente o QID medido, e SO para a linha que hoje carrega o rotulo
-- que este backfill escreveu. Linha editada depois por outro caminho nao volta.

BEGIN;

WITH alvo(slug, qid, rotulo) AS (
  VALUES
    ('joao-campos', 'Q212238', 'Servidor público'),
      ('joel-rodrigues', 'Q212238', 'Servidor público'),
      ('gabriel-azevedo', 'Q33999', 'Ator'),
      ('paulo-martins-gov-pr', 'Q36180', 'Escritor'),
      ('mateus-simoes', 'Q37226', 'Professor'),
      ('geraldo-alckmin', 'Q39631', 'Médico'),
      ('natasha-slhessarenko', 'Q39631', 'Médico'),
      ('acm-neto', 'Q40348', 'Advogado'),
      ('adailton-furia', 'Q40348', 'Advogado'),
      ('ciro-gomes-gov-ce', 'Q40348', 'Advogado'),
      ('david-almeida', 'Q40348', 'Advogado'),
      ('elmano-de-freitas', 'Q40348', 'Advogado'),
      ('haddad-gov-sp', 'Q40348', 'Advogado'),
      ('jose-eliton', 'Q40348', 'Advogado'),
      ('juliana-brizola', 'Q40348', 'Advogado'),
      ('pedro-cunha-lima', 'Q40348', 'Advogado'),
      ('ataides-oliveira', 'Q43845', 'Empresário'),
      ('otaviano-pivetta', 'Q43845', 'Empresário'),
      ('paula-belmonte', 'Q43845', 'Empresário'),
      ('gilberto-kassab', 'Q81096', 'Engenheiro'),
      ('adriana-accorsi', 'Q82955', 'Político'),
      ('alan-rick', 'Q82955', 'Político'),
      ('alexandre-curi', 'Q82955', 'Político'),
      ('amelio-cayres', 'Q82955', 'Político'),
      ('beto-faro', 'Q82955', 'Político'),
      ('cleitinho', 'Q82955', 'Político'),
      ('confucio-moura', 'Q82955', 'Político'),
      ('da-vitoria', 'Q82955', 'Político'),
      ('daniel-vilela', 'Q82955', 'Político'),
      ('dr-furlan', 'Q82955', 'Político'),
      ('edegar-pretto', 'Q82955', 'Político'),
      ('eduardo-braga', 'Q82955', 'Político'),
      ('eduardo-braide', 'Q82955', 'Político'),
      ('eduardo-girao', 'Q82955', 'Político'),
      ('eduardo-paes', 'Q82955', 'Político'),
      ('erika-hilton', 'Q82955', 'Político'),
      ('felicio-ramuth', 'Q82955', 'Político'),
      ('gilson-machado', 'Q82955', 'Político'),
      ('guto-silva', 'Q82955', 'Político'),
      ('hana-ghassan', 'Q82955', 'Político'),
      ('hildon-chaves', 'Q82955', 'Político'),
      ('jose-carlos-aleluia', 'Q82955', 'Político'),
      ('laurez-moreira', 'Q82955', 'Político'),
      ('leandro-grass', 'Q82955', 'Político'),
      ('mailza-assis', 'Q82955', 'Político'),
      ('marconi-perillo', 'Q82955', 'Político'),
      ('marcos-vieira', 'Q82955', 'Político'),
      ('nikolas-ferreira', 'Q82955', 'Político'),
      ('omar-aziz', 'Q82955', 'Político'),
      ('paulo-hartung', 'Q82955', 'Político'),
      ('pazolini', 'Q82955', 'Político'),
      ('raquel-lyra', 'Q82955', 'Político'),
      ('ricardo-cappelli', 'Q82955', 'Político'),
      ('roberto-cidade', 'Q82955', 'Político'),
      ('rodrigo-bacellar', 'Q82955', 'Político'),
      ('rodrigo-pacheco', 'Q82955', 'Político'),
      ('simao-jatene', 'Q82955', 'Político'),
      ('washington-reis', 'Q82955', 'Político'),
      ('wellington-fagundes', 'Q82955', 'Político'),
      ('wilder-morais', 'Q82955', 'Político'),
      ('anderson-ferreira', 'Q937857', 'Futebolista'),
      ('jeronimo', 'Q937857', 'Futebolista'),
      ('silvio-mendes', 'Q937857', 'Futebolista')
)
UPDATE public.candidatos c
SET profissao_declarada = a.qid
FROM alvo a
WHERE c.slug = a.slug
  AND c.profissao_declarada = a.rotulo;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260830120000';

COMMIT;
