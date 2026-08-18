-- Etapa 1E: Site vs Banco. Auditoria somente leitura, project_id wskpzsobvqwhnbsdsmok.
-- Executado em 2026-07-24 via mcp execute_sql. Nenhuma escrita no banco.
-- Relatorio correspondente: scratchpad/audit/site.md (Achados 0 a 7 + tabela das 10 fichas).
-- Correcao do achado C1.1 aplicada aqui na secao 2.3: scratchpad/audit/_c11-corrigido.md.
--
-- Objetivo deste arquivo: reproduzir o DIFF entre o que o site publica e o que o banco tem.
-- Cada query abaixo devolve o LADO BANCO do diff. O lado SITE vem dos comandos de shell
-- comentados na secao 0. O achado so existe quando os dois lados divergem.
--
-- Todas as queries foram rodadas antes de salvar este arquivo. Os resultados observados em
-- 2026-07-24 estao anotados em cada bloco com o prefixo "-- ->".
-- Valores dependentes de CURRENT_DATE (idade derivada) mudam com o tempo; os demais nao.

-- =====================================================================
-- 0. LADO SITE DO DIFF (nao e SQL; e o par de cada query abaixo)
-- =====================================================================
--
-- curl -s https://puxaficha.com.br/sitemap.xml \
--   | grep -o "/candidato/[a-z0-9-]*" | sed "s|/candidato/||" | sort -u > site_sitemap.txt
-- curl -s https://puxaficha.com.br/api/candidato-slugs   > slugs.json
-- curl -s https://puxaficha.com.br/api/search-index      > search-index.json
-- curl -s https://puxaficha.com.br/api/candidato-profile/<slug> > api-<slug>.json
-- curl -s https://puxaficha.com.br/candidato/<slug>      > html-<slug>.html
-- curl -s https://puxaficha.com.br/ | grep -o 'data-pf-comparador-age="[^"]*"'
--
-- Depois: diff site_sitemap.txt <(saida da query 1.2)
--
-- ATENCAO (Achado 0 de site.md): o corpo da ficha (as 8 abas) NAO esta no HTML servido; ele
-- so aparece apos JS no cliente chamar /api/candidato-profile/<slug>. Para conferir campo de
-- aba use o JSON da API ou um navegador real, nunca o HTML cru. Os campos do CABECALHO
-- (nome, foto, biografia, naturalidade, formacao, idade) estao no HTML servido e podem ser
-- conferidos com curl.

-- =====================================================================
-- 1. CONJUNTO EXATO DE SLUGS PUBLICAVEIS
--    Prova: define quantas e quais fichas o site TEM que publicar. Qualquer slug a mais no
--    sitemap/API e vazamento do gate; qualquer um a menos e ficha sumida.
-- =====================================================================

-- 1.1 Contagens de controle e hash do conjunto de slugs.
-- O hash permite comparar o conjunto inteiro sem transportar 195 linhas: se o md5 do lado
-- site (mesmo sort, mesma virgula) bater, os conjuntos sao identicos.
select
  (select count(*) from public.candidatos) as total_tabela,
  (select count(*) from public.candidatos where publicavel = true) as publicavel_true,
  (select count(*) from public.candidatos where publicavel = true and status <> 'removido') as gate_completo,
  (select count(*) from public.candidatos_publico) as na_view,
  (select md5(string_agg(slug, ',' order by slug)) from public.candidatos_publico) as hash_slugs_view,
  (select md5(string_agg(slug, ',' order by slug)) from public.candidatos where publicavel = true) as hash_slugs_tabela;
-- -> total_tabela=248, publicavel_true=195, gate_completo=195, na_view=195,
--    hash_slugs_view = hash_slugs_tabela = a5d3cb953d71c9ef9a65e9e71f19c221
-- Leitura: os dois hashes iguais provam que hoje `publicavel = true` sozinho ja define o
-- conjunto (nenhum publicavel esta com status 'removido'), ou seja, as duas metades do
-- predicado da view nao se contradizem. Bate com o lado site: sitemap.xml com 195 URLs
-- /candidato/*, /api/candidato-slugs com array de 195, /api/search-index com data de 195
-- (medidos em site.md, Achado 5).

-- 1.2 A lista exportavel, para diff textual contra o sitemap.
select slug from public.candidatos_publico order by slug;
-- Na auditoria esta lista foi rodada com `limit 3` (-> acm-neto, adailton-furia, aecio-neves)
-- e depois embrulhada na contagem abaixo, para nao despejar 195 linhas no log. Rodar sem
-- limit e o que gera o arquivo para o diff contra o sitemap.
select count(*) as n, min(slug) as primeiro, max(slug) as ultimo
from (select slug from public.candidatos_publico order by slug) t;
-- -> n=195, primeiro=acm-neto, ultimo=ze-batista

-- =====================================================================
-- 2. O QUE A VIEW PUBLICA EXPOE VERSUS A TABELA BASE
--    Prova: o recorte publico e feito por projecao de coluna no SQL da view, nao por filtro
--    de aplicacao. E onde nasce tanto a protecao de CPF (Achado 4) quanto a assimetria de
--    idade (C1.1 corrigido).
-- =====================================================================

-- 2.1 Coluna a coluna: o que a tabela tem e o que a view publica deixa passar.
select c.column_name, c.data_type,
  (v.column_name is not null) as exposta_em_candidatos_publico
from information_schema.columns c
left join information_schema.columns v
  on v.table_schema = 'public' and v.table_name = 'candidatos_publico' and v.column_name = c.column_name
where c.table_schema = 'public' and c.table_name = 'candidatos'
order by exposta_em_candidatos_publico, c.ordinal_position;
-- -> 8 colunas NAO expostas: cpf, cpf_hash, email_campanha, wikidata_id, tcu_inabilitado,
--    tcu_contas_irregulares, publicavel, created_at. As outras 25 sao expostas.
-- Leitura: confirma o Achado 4 no nivel de banco. A lista bate com CANDIDATO_COLUMNS em
-- src/lib/api.ts:121, que e a segunda camada. Se uma migration futura adicionar coluna
-- sensivel a view, esta query acusa no mesmo dia.

-- 2.2 Quem pode ler o que. Prova de que o cliente anonimo nao alcanca a tabela crua.
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('candidatos','candidatos_publico','v_ficha_candidato','v_comparador')
  and grantee in ('anon','authenticated','service_role')
group by table_name, grantee
order by table_name, grantee;
-- -> public.candidatos: SO service_role aparece (anon e authenticated nao tem linha nenhuma,
--    efeito do REVOKE em supabase/migrations/20260401002545_harden_public_candidate_surface.sql).
--    candidatos_publico: anon e authenticated com SELECT.
--    v_comparador e v_ficha_candidato: anon e authenticated com SELECT (mais REFERENCES/TRIGGER/
--    TRUNCATE herdados, inofensivos em view).

-- 2.3 DIVERGENCIA DE VALOR ENTRE AS DUAS VIEWS PUBLICAS: idade.
-- Este e o achado C1.1 corrigido. candidatos_publico expoe a coluna crua (sempre nula);
-- v_comparador faz COALESCE(idade, EXTRACT(year FROM age(CURRENT_DATE, data_nascimento))).
-- Resultado: o MESMO candidato tem idade no comparador e nao tem na ficha nem na API.
select
  (select count(*) from public.candidatos_publico) as publicaveis,
  (select count(*) filter (where idade is not null) from public.candidatos_publico) as idade_na_ficha_e_api,
  (select count(*) filter (where data_nascimento is not null) from public.candidatos_publico) as com_data_nascimento,
  (select count(*) filter (where idade is not null) from public.v_comparador) as idade_no_comparador,
  (select count(*) from public.v_comparador where idade is null) as sem_idade_no_comparador;
-- -> publicaveis=195, idade_na_ficha_e_api=0, com_data_nascimento=176,
--    idade_no_comparador=176, sem_idade_no_comparador=19
-- Lado site: GET /api/candidato-profile/lula devolve idade=null com data_nascimento=1945-10-06,
-- e o HTML de / traz data-pf-comparador-age="80" para o slug lula, no mesmo dia.

-- 2.3b Os candidatos afetados, nominalmente (o diff linha a linha).
select cp.slug, cp.cargo_disputado, cp.data_nascimento,
       cp.idade as idade_ficha_e_api, vc.idade as idade_comparador
from public.candidatos_publico cp
join public.v_comparador vc on vc.id = cp.id
where cp.idade is distinct from vc.idade
order by cp.cargo_disputado, cp.slug
limit 10;
-- -> 10 primeiras linhas (o total e 176): anderson-ferreira null vs 53, andre-kamai null vs 44,
--    paulo-serra null vs 53, tadeu-de-souza null vs 54, acm-neto null vs 47,
--    adailton-furia null vs 39, alan-rick null vs 49, alex-pucineli null vs 40,
--    alexandre-kalil null vs 67, alvaro-dias-rn null vs 66.
--    Retirar o LIMIT devolve os 176. acm-neto: 47 no painel de /uf/ba, nada na propria ficha.

-- 2.4 Universo do comparador por cargo (Achado 1 de site.md).
-- v_comparador cobre os 195, mas nenhuma pagina carrega os 195: a home e /comparar pedem
-- cargo Presidente (src/app/(site)/page.tsx:26 e o default cargo ?? "Presidente" em
-- src/lib/api.ts:1297) e /uf/[uf] pede Governador (src/app/(site)/uf/[uf]/page.tsx:107).
select cargo_disputado,
       count(*) as no_universo_do_comparador,
       count(*) filter (where idade is not null) as com_idade_derivada
from public.v_comparador
group by cargo_disputado
order by no_universo_do_comparador desc;
-- -> Governador 168 (149 com idade), Presidente 13 (13), Senador 7 (7),
--    Deputado Federal 4 (4), Vice-Governador 3 (3).
-- Leitura: 14 publicaveis (Senador + Deputado Federal + Vice-Governador) estao na view mas
-- nao aparecem em nenhum comparador renderizado, porque nenhuma pagina passa esses cargos.

-- =====================================================================
-- 3. O QUE O GATE DE PUBLICACAO TEM QUE BLOQUEAR
--    Prova: nenhum destes pode aparecer em HTML, API, sitemap ou search-index.
-- =====================================================================

-- 3.1 Total de bloqueados e por qual metade do predicado eles caem.
select
  count(*) as total_bloqueados,
  count(*) filter (where publicavel = false) as por_publicavel_false,
  count(*) filter (where status = 'removido') as por_status_removido,
  count(*) filter (where publicavel = false and status = 'removido') as por_ambos
from public.candidatos c
where not exists (select 1 from public.candidatos_publico p where p.id = c.id);
-- -> total=53, por_publicavel_false=53, por_status_removido=11, por_ambos=11
-- Leitura: 195 + 53 = 248 = total da tabela. `publicavel = false` e hoje condicao suficiente
-- para bloquear os 53; `status = 'removido'` nunca bloqueia sozinho (os 11 tambem tem
-- publicavel = false). Redundancia proposital, nao contradicao.

-- 3.2 Perfil dos bloqueados, para saber o que se esperaria ver se o gate vazasse.
select c.status, c.cargo_disputado, count(*) as bloqueados
from public.candidatos c
where not exists (select 1 from public.candidatos_publico p where p.id = c.id)
group by c.status, c.cargo_disputado
order by bloqueados desc;
-- -> pre-candidato/Governador 30, removido/Presidente 9, pre-candidato/Senador 5,
--    pre-candidato/Presidente 3, desistente/Nenhum 3, removido/Governador 2, ativo/Governador 1.
-- Nota: existe 1 com status 'ativo' e publicavel = false. Curadoria pendente, nao bug do gate.

-- 3.3 A lista completa, em uma string, pronta para grep nas superficies do site.
select count(*) as bloqueados,
       string_agg(c.slug, ' ' order by c.slug) as slugs_que_nao_podem_aparecer
from public.candidatos c
where not exists (select 1 from public.candidatos_publico p where p.id = c.id);
-- -> 53 slugs. Inclui nomes de alto trafego de busca: jair-bolsonaro, fernando-haddad,
--    marina-silva, guilherme-boulos, simone-tebet, nikolas-ferreira, pablo-marcal, tarcisio,
--    geraldo-alckmin, michelle-bolsonaro, ratinho-junior, rodrigo-pacheco, erika-hilton.
-- Uso: for s in $(saida acima); do grep -c "$s" sitemap.xml slugs.json search-index.json; done
-- Esperado: 0 em todas. Medido em site.md (Achado 5) para 3 deles, nas 4 superficies.

-- 3.4 Os 3 slugs efetivamente testados contra as 4 superficies em site.md.
select slug, nome_urna, cargo_disputado, estado, status, publicavel,
       (status <> 'removido' and publicavel = true) as deveria_publicar
from public.candidatos
where slug in ('aldo-rebelo','adriana-accorsi','alexandre-curi')
order by slug;
-- -> os 3 com publicavel=false, status='pre-candidato', deveria_publicar=false.
--    Lado site: HTML 404, /api/candidato-profile 404, ausentes de sitemap.xml,
--    /api/candidato-slugs e /api/search-index.

-- =====================================================================
-- 4. CAMPOS QUE A ETAPA site.md APONTOU COMO DIVERGENTES ENTRE BANCO E TELA
-- =====================================================================

-- 4.1 Achado 2: "Trocas de partido" com dois numeros na mesma ficha.
-- A faixa de estatisticas usa countPartySwitches() (src/lib/party-switches.ts:412-427), que
-- descarta ate uma anchor row (primeira filiacao conhecida) e as linhas nao efetivas; o
-- titulo da aba Trajetoria conta as linhas cruas. Esta query aproxima a regra em SQL
-- (descarta 1 anchor + os no-op) para listar quem tende a exibir dois numeros diferentes.
-- Aproximacao declarada: isAnchorRow() no TS olha o token de filiacao, nao so a ordem.
with cru as (
  select candidato_id, count(*) as linhas_cruas,
         count(*) filter (where partido_anterior is not distinct from partido_novo) as no_op
  from public.mudancas_partido
  group by candidato_id
)
select c.slug, c.nome_urna, cru.linhas_cruas, cru.no_op,
       greatest(cru.linhas_cruas - cru.no_op - 1, 0) as efetivas_aprox
from cru
join public.candidatos_publico c on c.id = cru.candidato_id
where cru.linhas_cruas <> greatest(cru.linhas_cruas - cru.no_op - 1, 0)
order by cru.linhas_cruas desc, c.slug
limit 15;
-- -> topo: eduardo-braide 8 cruas vs 7 efetivas, jeronimo 7 vs 6, alvaro-dias-rn 6 vs 5,
--    amelio-cayres 6 cruas com 1 no-op vs 4, ciro-gomes-gov-ce 6 vs 5, david-almeida 6 vs 5,
--    omar-aziz 6 vs 5, e mais.
-- Leitura: a divergencia de rotulo do Achado 2 nao e exclusiva de acm-neto (1 vs 2); ela
-- aparece em todo candidato com pelo menos 1 linha em mudancas_partido.

-- 4.2 Achado 3b: linhas de troca de partido que sao no-op (mesmo partido para o mesmo).
-- Ficam no banco e nunca aparecem na ficha. Comportamento esperado, registrado para que
-- ninguem conte essas linhas como "dado perdido" num diff futuro.
select c.slug, mp.ano, mp.partido_anterior, mp.partido_novo,
  (mp.partido_anterior is null) as anchor_row,
  (mp.partido_anterior is not distinct from mp.partido_novo) as no_op
from public.mudancas_partido mp
join public.candidatos_publico c on c.id = mp.candidato_id
where c.slug in ('acm-neto','andre-kamai','edegar-pretto')
order by c.slug, mp.ano;
-- -> acm-neto: 2008 PFL->DEM e 2022 DEM->UNIAO (nenhuma no-op, nenhuma com partido_anterior
--    nulo; a anchor do TS e a linha mais antiga, exibida como "Filiacao: DEM").
--    andre-kamai: 2026 PT->PT (no_op). edegar-pretto: 2026 PT->PT (no_op).
--    Confere com a API dos dois, que devolve mudancas_partido: [].

-- 4.3 Achado 3: historico_politico cru versus o que a ficha exibe.
-- normalizeHistoricoPoliticoForDisplay (src/lib/historico-dedupe.ts, chamada em
-- src/lib/api.ts:61) reescreve datas de mandato e funde linhas sobrepostas. O banco e a
-- referencia; a tela mostra menos linhas e, em alguns casos, periodos diferentes.
select c.slug, count(*) as linhas_cruas,
       min(hp.periodo_inicio) as inicio_min, max(hp.periodo_fim) as fim_max
from public.historico_politico hp
join public.candidatos_publico c on c.id = hp.candidato_id
where c.slug in ('anderson-ferreira','adailton-furia','delegado-eder-mauro','dr-fernando-maximo','edegar-pretto')
group by c.slug order by c.slug;
-- -> adailton-furia 7, anderson-ferreira 7, delegado-eder-mauro 6, dr-fernando-maximo 3,
--    edegar-pretto 7.
-- Lado site (contado no campo "historico" de api-<slug>.json): 6, 6, 5, 2 e 5.
-- Diferenca de 1 a 2 linhas em todos os 5, mais reescrita de periodo (anderson-ferreira:
-- Deputado Federal 2011-2017 no banco vira 2011-2014 na tela).

-- 4.4 Achado 4: mascaramento de documento em campo de texto livre.
-- A trigger de 20260711180000_public_document_privacy_hardening.sql ja rodou em producao.
-- Esta query mede a extensao real do mascaramento (site.md so citou a amostra de 2 candidatos).
select 'patrimonio.bens' as campo, count(*) as linhas_mascaradas
from public.patrimonio where bens::text like '%documento mascarado%'
union all
select 'historico_politico.observacoes', count(*)
from public.historico_politico where observacoes like '%documento mascarado%'
union all
select 'mudancas_partido.contexto', count(*)
from public.mudancas_partido where contexto like '%documento mascarado%'
union all
select 'projetos_lei.ementa', count(*)
from public.projetos_lei where ementa like '%documento mascarado%'
order by 1;
-- -> patrimonio.bens 102, historico_politico.observacoes 12, mudancas_partido.contexto 1,
--    projetos_lei.ementa 1.
-- Leitura: 116 linhas ja passaram pelo mascaramento. O texto ao redor permanece; so a
-- sequencia numerica virou "[documento mascarado]".

-- 4.5 Achado 6: ranking de patrimonio filtrado por cargo (contraste positivo com o Achado 1).
select c.slug, c.nome_urna, c.estado,
       (select pt.valor_total from public.patrimonio pt
        where pt.candidato_id = c.id order by pt.ano_eleicao desc limit 1) as ultimo_patrimonio
from public.candidatos_publico c
where c.cargo_disputado = 'Governador'
order by ultimo_patrimonio desc nulls last
limit 5;
-- -> otaviano-pivetta 378.869.597,56; vittorio-medioli 351.724.386,81;
--    maria-do-carmo 90.216.572,93; eduardo-girao 48.177.784,31; acm-neto 41.718.572,69.
-- Lado site: /rankings/patrimonio-declarado?cargo=Governador devolve a mesma ordem, com
-- otaviano-pivetta em 1o e vittorio-medioli em 2o. O filtro por cargo na URL funciona aqui,
-- o que isola o Achado 1 como omissao da pagina /comparar, nao limitacao de arquitetura.

-- 4.6 Achado 7: pontos de atencao visiveis carregam fonte com URL.
-- is_public_attention_point() e a mesma funcao usada pela RLS e por v_comparador, entao esta
-- contagem e exatamente o universo que chega ao cliente.
select
  count(*) as pontos_visiveis,
  count(*) filter (where jsonb_array_length(coalesce(pa.fontes, '[]'::jsonb)) > 0) as com_fonte,
  count(*) filter (where pa.fontes::text like '%http%') as com_url_http
from public.pontos_atencao pa
join public.candidatos_publico c on c.id = pa.candidato_id
where is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado);
-- -> pontos_visiveis=58, com_fonte=58, com_url_http=58 (100% dos alertas publicos tem fonte
--    com URL, nao so a amostra de 4 candidatos que site.md inspecionou a mao).

-- =====================================================================
-- 5. AMOSTRA CAMPO A CAMPO: 2 FICHAS POR CARGO, 5 CARGOS
--    Estes sao os 10 slugs da tabela "banco vs ficha" de site.md. Rodar esta query e depois
--    baixar api-<slug>.json e html-<slug>.html para os 10 reproduz aquela tabela.
-- =====================================================================
with ranked as (
  select slug, nome_urna, cargo_disputado, estado, status, situacao_candidatura,
         fonte_dados, ultima_atualizacao,
         row_number() over (partition by cargo_disputado order by slug) as rn
  from public.candidatos_publico
)
select slug, nome_urna, cargo_disputado, estado, status, situacao_candidatura, ultima_atualizacao
from ranked where rn <= 2
order by cargo_disputado, rn;
-- -> Deputado Federal: anderson-ferreira, andre-kamai. Governador: acm-neto, adailton-furia.
--    Presidente: aecio-neves, augusto-cury. Senador: delegado-eder-mauro, dr-fernando-maximo.
--    Vice-Governador: amelio-cayres, edegar-pretto.
-- Nota: Deputado Federal tem 4 publicaveis e Vice-Governador tem 3, entao "2 por cargo" nesses
-- dois casos e metade ou dois tercos do censo, nao uma amostra pequena.
