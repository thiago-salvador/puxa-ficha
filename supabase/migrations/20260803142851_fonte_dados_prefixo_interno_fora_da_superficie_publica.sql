-- BUG ENCONTRADO NA VERIFICACAO VISUAL DE 03/08/2026.
--
-- A migration 20260803134124 marcou as 5 fichas de nome civil provisorio com uma
-- string em `fonte_dados`, para que a proxima migration de identidade as achasse
-- por query. So que `candidatos_publico` repassa `fonte_dados` inteiro e o
-- componente ProfileSourceFooter faz join(', ') dele na linha "Fontes:" da ficha.
--
-- Resultado no ar, conferido em screenshot de https://puxaficha.com.br/candidato/carlos-machado:
--   "Fontes: curadoria, G1 SP 2026-08-02, Metropoles 2026-08-01,
--    nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)."
--
-- Marcador operacional interno virou texto de fonte para o leitor, dois dias
-- antes do video de lancamento publico. Nao e erro factual, e vazamento de
-- superficie.
--
-- CONVENCAO CRIADA AQUI: entrada de `fonte_dados` com prefixo 'interno:' e
-- anotacao operacional e NUNCA sai na superficie publica. A view filtra, a
-- tabela base guarda. Query de manutencao continua funcionando:
--
--   SELECT slug FROM public.candidatos
--   WHERE EXISTS (SELECT 1 FROM unnest(fonte_dados) f WHERE f LIKE 'interno:%');
--
-- Isto vale para qualquer anotacao futura, nao so para o placeholder de nome.

UPDATE public.candidatos
SET fonte_dados = array_replace(
      fonte_dados,
      'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)',
      'interno:nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)'
    )
WHERE 'nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)' = ANY(fonte_dados);

-- security_invoker=true e reafirmado de proposito: CREATE OR REPLACE preserva
-- reloptions, mas deixar implicito aqui seria contar com isso em silencio, e a
-- migration 20260712003000 existe justamente porque essa opcao importa.
CREATE OR REPLACE VIEW public.candidatos_publico
WITH (security_invoker = true) AS
 SELECT id,
    nome_completo,
    nome_urna,
    slug,
    data_nascimento,
    COALESCE(idade, EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone, data_nascimento::timestamp with time zone))::integer) AS idade,
    naturalidade,
    formacao,
    profissao_declarada,
    genero,
    estado_civil,
    cor_raca,
    partido_atual,
    partido_sigla,
    cargo_atual,
    cargo_disputado,
    estado,
    status,
    situacao_candidatura,
    biografia,
    foto_url,
    site_campanha,
    redes_sociais,
    ( SELECT array_agg(f.valor ORDER BY f.ord)
        FROM unnest(c.fonte_dados) WITH ORDINALITY AS f(valor, ord)
       WHERE f.valor NOT LIKE 'interno:%') AS fonte_dados,
    ultima_atualizacao
   FROM candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;;
