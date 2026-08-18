-- wilson-witzel (D35-RJ) desistiu da pre-candidatura ao governo do RJ em
-- 01/08/2026 e declarou apoio a Anthony Garotinho (REPUBLICANOS), que ja esta
-- publicado no site. Duas fontes independentes de circulacao nacional: G1 RJ,
-- 01/08, "Witzel desiste de pre-candidatura para apoiar Garotinho no RJ"; Folha
-- de S.Paulo, 01/08, "Witzel retira candidatura para apoiar Garotinho ao
-- Governo do RJ". Evidencia POSITIVA de saida, criterio da varredura de 30/07.
--
-- Mesma combinacao de campos usada em 20260730120000: nada e deletado, a ficha
-- sai da superficie publica e o historico permanece, entao e reversivel se ele
-- voltar antes do registro de 15/08 (como aconteceu com emanuel-cacho).
UPDATE public.candidatos
SET status = 'desistente',
    situacao_candidatura = 'desistente',
    cargo_disputado = 'Nenhum',
    publicavel = false,
    ultima_atualizacao = NOW()
WHERE slug = 'wilson-witzel';;
