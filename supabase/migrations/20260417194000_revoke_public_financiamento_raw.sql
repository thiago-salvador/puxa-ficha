-- Migration B: revoga SELECT público da tabela bruta financiamento (restritiva, pós-deploy)
-- Objetivo: impedir PostgREST anon de ler identificadores sensíveis (cpf_hash, cnpj) da tabela bruta
-- Compatibilidade: aplicar SOMENTE APÓS deploy verificado do app usando financiamento_publico
-- Pré-condição: Migration A (20260417193000) aplicada e app em produção usando financiamento_publico
-- Data: 2026-04-17
-- Ordem: aplicar DEPOIS de deploy verificado do app que usa financiamento_publico

-- Revogar SELECT público da tabela bruta financiamento
REVOKE SELECT ON financiamento FROM anon, authenticated;

-- Nota: service_role continua podendo acessar a tabela bruta para scripts internos
