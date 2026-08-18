-- Inclusoes de pre-candidatos a Governador confirmados em convencao que nao
-- estavam na superficie publica. Aplicada em 30/07/2026.
--
-- CONTEXTO. A varredura das 27 UFs (docs/varredura-governadores-2026-07-30.md)
-- foi procurar excesso e encontrou falta: o site estava SUB-coberto, e em varios
-- estados tinha quem saiu e nao tinha quem entrou no lugar. Estas sao as
-- inclusoes que sobreviveram a verificacao.
--
-- DE 17 CANDIDATAS A INCLUSAO, SO 6 ENTRARAM. As outras 11 foram barradas, e o
-- motivo de cada uma esta registrado no doc da varredura. Resumo:
--   - 4 tem candidatura solida mas nome_completo nao existe em nenhuma fonte
--     aberta (Elisson Ferreira AGIR-DF, Guilherme Fonseca PSTU-PE, Helio Vaz
--     AGIR-SC, Saulo Arcangeli PSTU-MA). nome_completo e NOT NULL e preencher com
--     nome de urna seria inventar nome civil de pessoa real. Desbloqueia no
--     registro do TSE em meados de agosto (a API do DivulgaCandContas para 2026
--     hoje devolve lista vazia).
--   - 3 sao pre-candidatura declarada pelo proprio partido, sem convencao
--     estadual (Cesar Pontes PCO-RS, Victor Assis PCO-PE, Brunno Andrade PCO-SC).
--   - 4 estavam ERRADAS na propria lista de lacunas e as fontes dizem outra
--     coisa: Nelita Frank disputa deputada estadual (a substituicao dela foi na
--     eleicao SUPLEMENTAR de RR, que ja ocorreu), Gal Leite e candidata ao Senado
--     e nao ao governo do PA, Luciana Amorim nao tem confirmacao alguma, e a
--     convencao de Luis Cesar Bueno ainda era FUTURA em 30/07.
--
-- Todos entram com publicavel = true por decisao do Thiago, cientes de que a
-- ficha nasce sem historico, patrimonio ou votacoes ate a ingestao rodar.

INSERT INTO public.candidatos
  (slug, nome_completo, nome_urna, partido_sigla, partido_atual, cargo_disputado,
   estado, status, situacao_candidatura, publicavel, ultima_atualizacao)
VALUES
  -- Convencao virtual do diretorio estadual do PT-MG em 27/07/2026 (CNN Brasil).
  -- nome_completo e ids.camara=74160 conferidos por mim na API oficial da Camara:
  -- nomeCivil 'PATRUS ANANIAS DE SOUZA', nomeEleitoral 'Patrus Ananias', PT, MG.
  -- Isso resolve a duvida de grafia do sobrenome: e SOUZA com Z, nao SOUSA.
  ('patrus-ananias', 'Patrus Ananias de Souza', 'Patrus Ananias',
   'PT', 'Partido dos Trabalhadores', 'Governador', 'MG',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao virtual do Partido Missao em 23/07/2026 (Tribuna NF). A chapa foi
  -- invertida por volta de 17-18/07: ele era vice e passou a cabeca, e Rafael Luz
  -- passou a vice. nome_completo cruzado com o registro dele no TSE de 2022.
  ('coronel-busnello', 'João Jacques Soares Busnello', 'Coronel Busnello',
   'MISSAO', 'Partido Missão', 'Governador', 'RJ',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao online do PSTU em 25/07/2026, confirmada em duas fontes
  -- independentes (ND Mais e NSC Total). Vice: Tatiane Pasdiora.
  ('marcus-sodre', 'Marcus Alexandre Sodré', 'Marcus Sodré',
   'PSTU', 'Partido Socialista dos Trabalhadores Unificado', 'Governador', 'SC',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao da federacao PSOL/REDE em 20/07/2026 em Palmas, com ata enviada ao
  -- TRE-TO no prazo legal (Folha do Bico, Atitude TO). NOTA de nome de urna:
  -- nenhuma fonte escreve 'Prof. Witer'; usam 'Witer Naves', e 'professor' e
  -- descricao de profissao. Vice: Maria Lucia Soares Viana.
  ('witer-naves', 'Witer Fonseca Naves', 'Witer Naves',
   'PSOL', 'Partido Socialismo e Liberdade', 'Governador', 'TO',
   'pre-candidato', 'pre-candidato', true, NOW()),

  -- Convencao no Recife no fim de semana de 25-26/07/2026 (Diario de Pernambuco,
  -- Frances News). CORRECAO DE PARTIDO: nao e DC (Democracia Crista). O TSE
  -- registra 'Democrata', que o party-utils.ts do repo canoniza como D35.
  -- Cadastrar como DC seria dado errado. nome_completo pode ser abreviado: as
  -- fontes escrevem so 'Jeremias Cosmo'. Conferir no registro do TSE.
  ('jeremias-cosmo', 'Jeremias Cosmo', 'Professor Jeremias',
   'D35', 'Democrata', 'Governador', 'PE',
   'pre-candidato', 'pre-candidato', true, NOW())
ON CONFLICT (slug) DO NOTHING;

-- marcelo-brigadeiro (MISSAO-SC) NAO era inclusao, e o achado mais interessante
-- do lote: ja existia no seed E no banco, com exatamente o mesmo nome_completo
-- que a pesquisa de hoje encontrou por caminho independente, apenas com
-- publicavel = false. Ou seja, nao faltava, estava despublicado. Convencao online
-- do Partido Missao em 23/07/2026 (ND Mais, NSC Total). So religar.
UPDATE public.candidatos
SET publicavel = true,
    status = 'pre-candidato',
    situacao_candidatura = 'pre-candidato',
    ultima_atualizacao = NOW()
WHERE slug = 'marcelo-brigadeiro';
