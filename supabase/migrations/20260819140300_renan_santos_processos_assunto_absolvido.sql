-- Leads de classe/assunto nos quatro CNJs civis do Renan Santos, e a linha
-- criminal com absolvição confirmada pelo MP-SP à imprensa. Sem CNJ inventado.

-- @write tabela=processos slug=renan-santos campos=descricao
UPDATE public.processos AS p
SET descricao = 'Reclamação disciplinar no PJeCor, Corregedoria Regional de Justiça do Trabalho da 15ª Região. O candidato consta no polo ativo. O DJEN registrou intimação disponibilizada em 2026-06-30. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.'
FROM public.candidatos AS c
WHERE p.candidato_id = c.id
  AND c.slug = 'renan-santos'
  AND p.numero_processo = '0000349-29.2026.2.00.0515';

-- @write tabela=processos slug=renan-santos campos=descricao
UPDATE public.processos AS p
SET descricao = 'Lista de apoiamento para criação de partido político na 144ª Zona Eleitoral de Fazenda Rio Grande (TRE-PR). O candidato consta no polo ativo. O DJEN registrou edital disponibilizado em 2025-09-23. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.'
FROM public.candidatos AS c
WHERE p.candidato_id = c.id
  AND c.slug = 'renan-santos'
  AND p.numero_processo = '0600089-03.2025.6.16.0144';

-- @write tabela=processos slug=renan-santos campos=descricao
UPDATE public.processos AS p
SET descricao = 'Recurso especial e recurso extraordinário no TJRJ. O candidato consta no polo ativo. O DJEN registrou intimação disponibilizada em 2024-12-13. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.'
FROM public.candidatos AS c
WHERE p.candidato_id = c.id
  AND c.slug = 'renan-santos'
  AND p.numero_processo = '0262930-72.2017.8.19.0001';

-- @write tabela=processos slug=renan-santos campos=descricao
UPDATE public.processos AS p
SET descricao = 'Procedimento comum cível de indenização por dano moral no TJSP, Foro Regional II de Santo Amaro. O candidato consta no polo passivo. A comunicação oficial do DJEN identifica Sleeping Giants Brasil no polo ativo e Movimento Brasil Livre, Renan Antonio Ferreira dos Santos e outros no polo passivo. As intimações foram disponibilizadas entre 2025-06-02 e 2026-06-29. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.'
FROM public.candidatos AS c
WHERE p.candidato_id = c.id
  AND c.slug = 'renan-santos'
  AND p.numero_processo = '1039971-32.2024.8.26.0002';

-- @write tabela=processos slug=renan-santos campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos (
  candidato_id,
  tipo,
  tribunal,
  numero_processo,
  descricao,
  status,
  data_inicio,
  data_decisao,
  gravidade,
  fonte,
  url_fonte
)
SELECT
  c.id,
  'criminal',
  'Justiça de São Paulo',
  NULL,
  'Renan Santos foi absolvido pela Justiça de São Paulo em processo no qual era acusado de estupro. O Ministério Público de São Paulo confirmou ao g1, em 4 de agosto de 2026, que a Promotoria pediu a absolvição após a instrução, por insuficiência de provas, e que a Justiça acolheu o pedido. O processo tramitou em segredo de Justiça para preservar a identidade da denunciante. O número do processo não é público. As informações desta linha vêm de cobertura jornalística ampla. O status de absolvido foi confirmado pelo Ministério Público de São Paulo, não por consulta aos autos.',
  'absolvido',
  NULL,
  NULL,
  NULL,
  'g1, confirmação do MP-SP',
  'https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/08/04/mp-de-sp-confirma-que-renan-santos-foi-absolvido-em-processo-por-acusacao-de-estupro.ghtml'
FROM public.candidatos AS c
WHERE c.slug = 'renan-santos'
  AND NOT EXISTS (
    SELECT 1
    FROM public.processos AS p
    WHERE p.candidato_id = c.id
      AND p.status = 'absolvido'
      AND p.url_fonte = 'https://g1.globo.com/sp/sao-paulo/eleicoes/2026/noticia/2026/08/04/mp-de-sp-confirma-que-renan-santos-foi-absolvido-em-processo-por-acusacao-de-estupro.ghtml'
  );
