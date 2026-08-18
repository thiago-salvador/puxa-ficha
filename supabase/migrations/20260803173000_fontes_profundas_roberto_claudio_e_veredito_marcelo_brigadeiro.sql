-- =====================================================================
-- Zera o gate de fontes: as 2 ultimas claims EM FICHA PUBLICA sem fonte
-- utilizavel (2026-08-03).
--
-- O QUE ESTAVA VERMELHO
-- `npm run data:link-check-fontes:gate` (workflow link-check-fontes.yml, que
-- roda com --gate-somente-publicos --fail-on-dead --fail-on-sem-substancia)
-- reprovava com 2 claims na linha "EM FICHA PUBLICA ... sem fonte utilizavel".
-- As duas com o MESMO defeito, e nao com defeito de conteudo: a fonte
-- cadastrada era dominio nu, entao probeUrlReal nem chega a fazer requisicao e
-- devolve `sem_caminho`, que `temDefeitoRealDeFonte` conta como defeito REAL
-- (nao e indisponibilidade temporaria, nao volta sozinho).
--
--   roberto-claudio     "Carreira politica: 2 mandato(s) registrado(s)"
--                       https://www.camara.leg.br + https://www.senado.leg.br
--   marcelo-brigadeiro  "Sem historico de mandato eletivo registrado"
--                       https://www.tse.jus.br
--
-- As duas sao gravidade baixa e as duas sao remanescentes do lote de
-- 2026-03-31 descrito em 20260803112556: claims geradas em massa com a home do
-- orgao no lugar da fonte. A etapa 1B (20260725120000) limpou 38 pontos dessa
-- mesma familia; estes dois passaram porque naquele momento seus candidatos
-- nao estavam no recorte publico.
--
-- DOIS DESFECHOS DIFERENTES, E A DIFERENCA E O TIPO DE AFIRMACAO
--   Bloco 1 (roberto-claudio):    afirmacao POSITIVA sobre mandatos exercidos.
--                                 Existe fonte primaria que a sustenta inteira.
--                                 Troca a URL, claim continua no ar.
--   Bloco 2 (marcelo-brigadeiro): afirmacao NEGATIVA universal ("nao possui
--                                 mandato ... registrado nas bases do TSE,
--                                 Camara ou Senado"). Nenhum link fundo prova
--                                 isso. Despublica por falta de lastro, NAO
--                                 por falsidade. Ver o bloco para o porque.
--
-- Nada e deletado. Os dois efeitos sao reversiveis por UPDATE de uma coluna.
-- Toda alteracao usa WHERE por id explicito e predicado IS DISTINCT FROM, entao
-- reexecutar nao produz efeito adicional.
--
-- METODO DE VERIFICACAO DAS URLS NOVAS (2026-08-03, ~14h30 -03)
-- Nao foi curl com olho no status. Cada URL passou pela MESMA funcao que o
-- gate usa, `probeUrlReal` de scripts/link-check-pontos-atencao.ts, que mede
-- substancia do corpo alem do HTTP. Veredito colado em cada bloco.
--
-- SELECT DE VALIDACAO EXECUTADO ANTES DE ESCREVER ESTE ARQUIVO
-- (rodado em producao, somente leitura, em 2026-08-03)
--
--   select p.id, c.slug, p.gravidade, p.titulo, p.fontes
--   from pontos_atencao p join candidatos c on c.id = p.candidato_id
--   join candidatos_publico cp on cp.id = c.id
--   where p.visivel
--     and not exists (
--       select 1 from jsonb_array_elements(p.fontes) f
--       where f->>'url' ~ '://[^/]+/.+'
--     );
--   -- 2 linhas: as duas tratadas aqui.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BLOCO 1: roberto-claudio, fonte primaria que sustenta a claim inteira
--
-- Claim publicada (gravidade baixa, id 7bb91fc3-a07b-4ac4-a106-2b571754fc96):
--   "Roberto Claudio Rodrigues Bezerra (UNIAO) possui 2 mandato(s)
--    registrado(s): Deputado Estadual (CE), Prefeito (Fortaleza)."
--
-- POR QUE NAO DAVA PARA SO APROFUNDAR AS URLS ANTIGAS
-- As fontes cadastradas eram as homes da Camara e do Senado. Nao existe pagina
-- funda dele em nenhuma das duas: Roberto Claudio nunca teve mandato federal.
-- Deputado estadual e prefeito nao aparecem nessas bases. Trocar a home da
-- Camara por uma pagina da Camara e impossivel aqui, nao apenas trabalhoso. E
-- o mesmo achado estrutural registrado no Bloco 3 de 20260725120000.
--
-- FONTE 1 (a que sustenta os DOIS cargos da claim, e por isso vem primeiro)
-- TSE, noticia oficial de 28/10/2012, atualizada em 08/07/2026.
-- probeUrlReal: viva, GET 200, 9326 caracteres de texto util.
-- Trecho literal, sobre o mandato de Prefeito:
--   "Roberto Claudio foi eleito prefeito de Fortaleza-CE com 650.607 votos, o
--    que corresponde a 53,02% dos votos validos."
-- Trecho literal, sobre o mandato de Deputado Estadual:
--   "Em 2006, foi eleito deputado estadual, sendo reeleito em 2010."
--
-- FONTE 2 (redundancia deliberada, nao enfeite)
-- Radio Senado, 28/10/2012. probeUrlReal: viva, GET 200, 4230 caracteres.
--   "COM 53% DOS VOTOS VALIDOS, ROBERTO CLAUDIO, DO PSB, FOI ELEITO NESTE
--    DOMINGO PREFEITO DE FORTALEZA, CAPITAL DO CEARA."
-- Existe porque tse.jus.br entrega 503 de forma intermitente (medido nesta
-- mesma sessao: 503 numa tentativa, 200 em tres seguidas). 503 vira
-- `indisponivel`, que sozinho nao derruba o gate, mas deixa a claim com zero
-- fonte viva. Com a segunda URL em www12.senado.leg.br, que e outro servidor,
-- a claim continua com fonte viva mesmo na janela ruim do TSE.
--
-- DUAS COISAS PARA O REVISOR EDITORIAL, QUE ESTA MIGRATION NAO CORRIGE
--   1. A contagem "2 mandato(s)" subestima. O historico_politico do proprio
--      banco tem 4 linhas com tipo_evento = 'mandato' para ele: Deputado
--      Estadual 2007-2012, Presidente da ALCE 2011-2012, Prefeito 2013-2016 e
--      Prefeito 2017-2020. E o mesmo defeito de redacao anotado em
--      20260725120000 para janaina-riva, fabio-trad e laurez-moreira, e
--      corrigido para tres deles em 20260803134247. Fica para a mesma fila.
--   2. Se a redacao vier a citar o cargo de 2026: ele e candidato a
--      VICE-Governador na chapa do Ciro Gomes, nao a Governador
--      (TSE consulta_cand 2026, SQ 60002531352, que e o que candidatos.
--      fonte_dados e cargo_disputado ja registram).
-- Nenhuma das duas e defeito de FONTE, entao nenhuma das duas segura o gate.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www.tse.jus.br/comunicacao/noticias/2012/Outubro/roberto-claudio-e-o-novo-prefeito-de-fortaleza-ce","data":"2012-10-28","titulo":"TSE: Roberto Claudio é o novo prefeito de Fortaleza-CE (eleito com 650.607 votos; eleito deputado estadual em 2006 e reeleito em 2010)"},{"url":"https://www12.senado.leg.br/radio/1/noticia/2012/10/28/com-53-dos-votos-validos-roberto-claudio-e-eleito-prefeito-de-fortaleza","data":"2012-10-28","titulo":"Rádio Senado: com 53% dos votos válidos, Roberto Cláudio é eleito prefeito de Fortaleza"}]'::jsonb
WHERE id = '7bb91fc3-a07b-4ac4-a106-2b571754fc96'
  AND fontes IS DISTINCT FROM '[{"url":"https://www.tse.jus.br/comunicacao/noticias/2012/Outubro/roberto-claudio-e-o-novo-prefeito-de-fortaleza-ce","data":"2012-10-28","titulo":"TSE: Roberto Claudio é o novo prefeito de Fortaleza-CE (eleito com 650.607 votos; eleito deputado estadual em 2006 e reeleito em 2010)"},{"url":"https://www12.senado.leg.br/radio/1/noticia/2012/10/28/com-53-dos-votos-validos-roberto-claudio-e-eleito-prefeito-de-fortaleza","data":"2012-10-28","titulo":"Rádio Senado: com 53% dos votos válidos, Roberto Cláudio é eleito prefeito de Fortaleza"}]'::jsonb;

-- ---------------------------------------------------------------------
-- BLOCO 2: marcelo-brigadeiro, despublicado por falta de fonte possivel
--
-- Claim publicada (gravidade baixa, id c75c15d0-9ed6-4504-babd-9c6d5453575e):
--   "Marcelo Brigadeiro (MISSAO) nao possui mandato eletivo federal ou estadual
--    registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel
--    municipal ou ser estreante na politica."
--
-- ISTO NAO E UM VEREDITO DE FALSIDADE. LEIA ANTES DE REVERTER.
-- 20260803112556 registra que o fact-check externo de 2026-08-03 conferiu esta
-- claim especifica e a deu como VERDADEIRA ("Ronaldo Mansur e Marcelo
-- Brigadeiro seguem de pe, e os dois foram confirmados como VERDADEIROS"). O
-- historico_politico dele no banco tem duas linhas, as duas com tipo_evento =
-- 'candidatura' e nenhuma com 'mandato': 1o suplente ao Senado por SC em 2018
-- (nao eleito) e pre-candidatura ao governo de SC em 2026. Ou seja: a
-- afirmacao continua batendo com tudo que sabemos.
--
-- O QUE FALTA E FONTE, E A FALTA E ESTRUTURAL
-- A afirmacao e uma negativa universal. Nenhuma URL prova que uma pessoa NAO
-- consta em tres bases. A home do TSE nunca provou, e por isso ela e o defeito
-- que o gate acusa; mas nenhuma pagina funda do TSE, da Camara ou do Senado
-- prova tambem. Foi o que fez a etapa 1B despublicar 19 claims identicas em
-- 20260725120000 ("uma home nao prova ausencia de nada") e o que deixou as
-- outras ~30 desta familia fora do ar desde entao. Esta e a ultima que ainda
-- estava publicada, e mante-la publicada seria aplicar o criterio de forma
-- desigual, que e exatamente o erro nomeado em 20260726210000.
--
-- O QUE FOI TENTADO ANTES DE DESPUBLICAR
--   1. TSE DivulgaCand, registro da candidatura de 2018 (SQ 240000609728):
--      https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/SC/2022802018/candidato/240000609728
--      Responde 200 com 7082 bytes de JSON. Confirma "MARCELO MARCEL FRANCO
--      JOSE DA SILVA", nome de urna "MARCELO BRIGADEIRO", cargo "1o Suplente",
--      situacao "Deferido". RECUSADA por duas razoes independentes:
--      (a) prova UMA candidatura, nao a ausencia de mandato em tres bases;
--          publicar essa URL como lastro da frase seria dizer que a fonte diz
--          o que ela nao diz, que e o criterio de 20260726210000;
--      (b) o corpo devolve CPF e titulo de eleitor em claro. O projeto audita
--          exposicao de documento (scripts/audit-public-document-exposure.ts) e
--          nao faz sentido criar exposicao nova para lastrear uma claim baixa.
--   2. Busca por pagina institucional que ateste a ausencia: nao existe. Camara
--      e Senado nao publicam pagina de "nao consta"; consulta sem resultado nao
--      e documento estavel nem citavel.
--
-- CRITERIO PARA REABRIR (nesta ordem de preferencia)
--   a. Reescrever a claim para o que a fonte primaria de fato sustenta, no
--      molde de 20260726150000: algo como "concorreu a 1o suplente ao Senado
--      por SC em 2018, sem ser eleito", lastreada no registro TSE acima. Isso
--      troca uma negativa universal por um fato positivo verificavel, e ai a
--      fonte serve.
--   b. Fonte que ateste a ausencia de forma citavel, se algum dia existir.
-- Enquanto nenhuma das duas acontecer, a claim fica fora do ar. Reverter e
-- `visivel = true`; o texto continua intacto no banco.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET visivel = false,
    despublicacao_motivo = 'Despublicada em 2026-08-03 por falta de fonte possivel, NAO por falsidade: o fact-check de 2026-08-03 (ver 20260803112556) confirmou a afirmacao como verdadeira, mas ela e uma negativa universal ("nao consta nas bases do TSE, Camara ou Senado") e nenhum link fundo prova ausencia. A unica fonte cadastrada era a home do TSE, dominio nu, que o link-check classifica como sem_caminho. Mesmo criterio das 19 claims identicas despublicadas em 20260725120000. Reabre reescrevendo a claim para o fato positivo que o registro TSE da candidatura de 2018 sustenta.',
    despublicado_em = now(),
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'veredito_fonte_2026_08_03', jsonb_build_object(
        'situacao', 'claim tida como verdadeira, sem fonte citavel possivel',
        'defeito_do_gate', 'sem_caminho (https://www.tse.jus.br, dominio nu)',
        'busca_feita', 'TSE DivulgaCand SQ 240000609728 (2018/SC) responde 200 e confirma candidatura a 1o suplente deferida, mas nao a ausencia de mandato, e expoe CPF em claro; nao ha pagina institucional de "nao consta" na Camara nem no Senado',
        'criterio_para_reabrir', 'reescrever para o fato positivo sustentado pelo registro TSE de 2018, ou anexar fonte que ateste a ausencia de forma citavel',
        'reversivel', true
      )
    )
WHERE id = 'c75c15d0-9ed6-4504-babd-9c6d5453575e'
  AND visivel IS DISTINCT FROM false;

COMMIT;

-- =====================================================================
-- VERIFICACAO POS-APLICACAO
--
--   -- 1. Deve retornar zero linhas: nenhuma claim em ficha publica com fonte
--   --    que nao aponte para documento.
--   select p.id, c.slug, f->>'url'
--   from pontos_atencao p join candidatos c on c.id = p.candidato_id
--   join candidatos_publico cp on cp.id = c.id,
--        lateral jsonb_array_elements(p.fontes) f
--   where p.visivel and f->>'url' !~ '://[^/]+/.+';
--
--   -- 2. Prova de ponta a ponta, que e a que vale:
--   --    gh workflow run link-check-fontes.yml --ref main
--   --    e o log tem que dizer, em EM FICHA PUBLICA:
--   --      com fonte morta: 0
--   --      sem fonte utilizavel: 0
-- =====================================================================
