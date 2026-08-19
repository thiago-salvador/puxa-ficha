-- Grau TSE (DS_GRAU_INSTRUCAO de consulta_cand_2026_BRASIL.csv, gerado
-- 17/08/2026 12:31:17) + instituição já curada. Sem curso inferido a partir
-- do grau, sem grau inventado a partir da instituição.

-- @write tabela=candidatos slug=augusto-cury campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Medicina pela Faculdade de Medicina de São José do Rio Preto',
    ultima_atualizacao = NOW()
WHERE slug = 'augusto-cury';

-- @write tabela=candidatos slug=pablo-marcal campos=formacao,formacao_instituicao,ultima_atualizacao
UPDATE public.candidatos
SET formacao = 'SUPERIOR COMPLETO',
    formacao_instituicao = 'Universidade Paulista (Unip)',
    ultima_atualizacao = NOW()
WHERE slug = 'pablo-marcal';
