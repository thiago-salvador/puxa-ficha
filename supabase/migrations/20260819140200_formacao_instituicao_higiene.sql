-- Move instituição gravada em formacao (grau TSE) para formacao_instituicao.
-- Grau volta a ser o DS_GRAU_INSTRUCAO do TSE 2026. Sem curso inferido.

-- @write tabela=candidatos slug=acm-neto campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Universidade Federal da Bahia',
    ultima_atualizacao = NOW()
WHERE slug = 'acm-neto';

-- @write tabela=candidatos slug=alysson-bezerra campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Universidade Federal Rural do Semi-Árido; Universidade do Estado do Rio Grande do Norte',
    ultima_atualizacao = NOW()
WHERE slug = 'alysson-bezerra';

-- @write tabela=candidatos slug=david-almeida campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Universidade Luterana do Brasil',
    ultima_atualizacao = NOW()
WHERE slug = 'david-almeida';

-- @write tabela=candidatos slug=dr-furlan campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Universidade Federal do Pará',
    ultima_atualizacao = NOW()
WHERE slug = 'dr-furlan';

-- @write tabela=candidatos slug=eduardo-paes campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Pontifícia Universidade Católica do Rio de Janeiro',
    ultima_atualizacao = NOW()
WHERE slug = 'eduardo-paes';

-- @write tabela=candidatos slug=joao-henrique-catan campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Instituto Presbiteriano Mackenzie',
    ultima_atualizacao = NOW()
WHERE slug = 'joao-henrique-catan';

-- @write tabela=candidatos slug=mailza-assis campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Universidade Federal do Acre (UFAC)',
    ultima_atualizacao = NOW()
WHERE slug = 'mailza-assis';

-- @write tabela=candidatos slug=mateus-simoes campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Faculdade de Direito Milton Campos',
    ultima_atualizacao = NOW()
WHERE slug = 'mateus-simoes';

-- @write tabela=candidatos slug=renan-santos campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR INCOMPLETO',
    formacao_instituicao = 'Universidade de São Paulo',
    ultima_atualizacao = NOW()
WHERE slug = 'renan-santos';

-- @write tabela=candidatos slug=sergio-moro-gov-pr campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Universidade Federal do Paraná',
    ultima_atualizacao = NOW()
WHERE slug = 'sergio-moro-gov-pr';

-- @write tabela=candidatos slug=wilder-morais campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Pontifícia Universidade Católica de Goiás',
    ultima_atualizacao = NOW()
WHERE slug = 'wilder-morais';

-- @write tabela=candidatos slug=elmano-de-freitas campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Faculdade de Direito da Universidade Federal do Ceará',
    ultima_atualizacao = NOW()
WHERE slug = 'elmano-de-freitas';

-- @write tabela=candidatos slug=raquel-lyra campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Faculdade de Direito da Universidade Federal de Pernambuco',
    ultima_atualizacao = NOW()
WHERE slug = 'raquel-lyra';

-- @write tabela=candidatos slug=requiao-filho campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Centro Universitário de Brasília',
    ultima_atualizacao = NOW()
WHERE slug = 'requiao-filho';

-- @write tabela=candidatos slug=ricardo-cappelli campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Centro Universitário Euroamericano',
    ultima_atualizacao = NOW()
WHERE slug = 'ricardo-cappelli';
