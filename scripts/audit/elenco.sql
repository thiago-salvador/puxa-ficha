-- =====================================================================
-- AUDITORIA ETAPA 1A: IDENTIDADE E ELENCO
-- Puxa Ficha OSS | project_id wskpzsobvqwhnbsdsmok | somente leitura
-- Gerado em 2026-07-24. Todas as queries abaixo sao SELECT puro,
-- reproduziveis via MCP supabase execute_sql ou psql read-only.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) POR QUE 248 LINHAS MAS 195 PUBLICAVEIS? (53 nao publicaveis)
-- ---------------------------------------------------------------------

-- 1.1 Distribuicao de status entre os nao publicaveis
select status, count(*)
from public.candidatos
where publicavel = false
group by 1
order by 2 desc;
-- Resultado 2026-07-24: pre-candidato=38, removido=11, desistente=3, ativo=1

-- 1.2 Cruzamento status x publicavel (visao completa da tabela)
select publicavel, status, count(*)
from public.candidatos
group by 1,2
order by 1,2;

-- 1.3 As 38 pre-candidato nao publicaveis: nao ha campo obrigatorio faltando
-- (nome, foto, bio), ou seja e decisao editorial de curadoria, nao gap de dado
select slug, nome_completo, nome_urna, cargo_disputado, estado, status, situacao_candidatura,
  (nome_completo is null or nome_completo='') as no_nome,
  (foto_url is null or foto_url='') as no_foto,
  (biografia is null or biografia='') as no_bio,
  fonte_dados
from public.candidatos where publicavel=false and status='pre-candidato'
order by slug;

-- 1.4 Os 11 removido + 3 desistente + 1 ativo (detalhe)
select slug, nome_completo, nome_urna, cargo_disputado, estado, status, situacao_candidatura, publicavel, foto_url
from public.candidatos where status in ('ativo','desistente','removido')
order by status, slug;

-- 1.5 Constraint que impede publicavel=true incoerente com status/cargo
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.candidatos'::regclass;
-- candidatos_publicavel_requires_disputa:
--   CHECK (publicavel IS NOT TRUE OR (cargo_disputado IS NOT NULL AND cargo_disputado <> 'Nenhum'
--          AND status NOT IN ('removido','desistente')))
-- Isso NAO cobre status='ativo' (fora do enum do app) nem bloqueia os 38 pre-candidato:
-- a nao-publicacao deles e curadoria manual, nao imposta pelo banco.

-- 1.6 Definicao da view usada pelo site (confirma o filtro real)
select table_name, view_definition from information_schema.views
where table_name in ('candidatos_publico','v_ficha_candidato');

-- 1.7 Confirma que NENHUM dos 53 nao-publicaveis vaza pela view candidatos_publico
select c.slug, c.status, c.publicavel,
  (c.slug in (select slug from candidatos_publico)) as vaza_na_view
from public.candidatos c
where c.publicavel = false
order by vaza_na_view desc, c.status, c.slug;
-- Resultado: vaza_na_view = false para as 53 linhas. Confirmado tambem via
-- curl -s https://puxaficha.com.br/api/candidato-profile/<slug> (404 para
-- jair-bolsonaro, fernando-haddad, ciro-gomes, marcio-franca, 2026-07-24).


-- ---------------------------------------------------------------------
-- 2) POR QUE 239 NO SEED (data/candidatos.json) MAS 248 NO BANCO?
-- ---------------------------------------------------------------------
-- Metodo: dump de slugs do banco (abaixo) comparado via `comm` com os 239
-- slugs de data/candidatos.json (script python + comm -23/-13, ver elenco.md).
select slug from public.candidatos order by slug;

-- Resultado 2026-07-24:
--   seed \ banco (no seed mas fora do banco): 0 slugs (todos os 239 existem no banco)
--   banco \ seed (no banco mas fora do seed): 9 slugs, TODOS com status='removido':
--     eduardo-leite, fernando-haddad, guilherme-boulos, jair-bolsonaro,
--     marina-silva, michelle-bolsonaro, pablo-marcal, simone-tebet, tarcisio
--   Isso fecha a conta: 239 (seed) + 9 (removido, fora do seed) = 248.
--   Interpretacao: esses 9 foram cogitados como pre-candidatos a Presidente
--   em algum momento, o seed parou de declara-los (nao fazem mais parte da
--   coorte de identidade ativa) e o banco manteve o registro histórico como
--   'removido' em vez de deletar a linha (create/apply-current-factual-fixes.ts
--   e o pipeline de escrita, nao um DELETE).

-- 2.1 Confere que os pares "duas carreiras" nao geram contradicao seed vs banco
select slug, cargo_disputado, estado, status, publicavel, wikidata_id, cpf
from public.candidatos
where slug in ('tarcisio','tarcisio-gov-sp','fernando-haddad','haddad-gov-sp','ciro-gomes','ciro-gomes-gov-ce')
order by slug;


-- ---------------------------------------------------------------------
-- 3) DUPLICATAS E HOMONIMOS
-- ---------------------------------------------------------------------

-- 3.1 Duplicatas por wikidata_id
select wikidata_id, array_agg(slug order by slug) as slugs, count(*)
from public.candidatos
where wikidata_id is not null and wikidata_id <> ''
group by wikidata_id
having count(*) > 1;

-- 3.2 Duplicatas por cpf (texto puro)
select cpf, array_agg(slug order by slug) as slugs, count(*)
from public.candidatos
where cpf is not null and cpf <> ''
group by cpf
having count(*) > 1;

-- 3.3 Duplicatas por cpf_hash -- ACHADO: coluna cpf_hash existe mas esta
-- 100% vazia (0/248), entao esta checagem nao detecta nada hoje, nao porque
-- nao ha duplicatas, mas porque o dado nunca foi populado.
select count(*) as total,
  count(cpf_hash) filter (where cpf_hash is not null and cpf_hash<>'') as com_cpf_hash,
  count(cpf) filter (where cpf is not null and cpf<>'') as com_cpf,
  count(wikidata_id) filter (where wikidata_id is not null and wikidata_id<>'') as com_wikidata
from public.candidatos;

-- 3.4 Duplicatas por nome_urna normalizado (lower/trim; sem unaccent pois a
-- extensao nao esta instalada neste projeto Supabase)
select lower(trim(nome_urna)) as nome_norm, array_agg(slug order by slug) as slugs, count(*)
from public.candidatos
group by 1
having count(*) > 1
order by 1;

-- 3.5 Duplicatas por nome_completo normalizado
select lower(trim(nome_completo)) as nome_norm, array_agg(slug order by slug) as slugs, count(*)
from public.candidatos
group by 1
having count(*) > 1
order by 1;

-- 3.6 Duplicatas por (data_nascimento + nome_completo) -- confirma mesma pessoa
select data_nascimento, lower(regexp_replace(nome_completo, '\s+', ' ', 'g')) as nome_norm,
  array_agg(slug order by slug) as slugs, count(*)
from public.candidatos
where data_nascimento is not null
group by 1,2
having count(*) > 1
order by 1;

-- Resultado consolidado 2026-07-24: 3 pares "mesma pessoa, dois cargos":
--   ciro-gomes (Presidente, publicavel=false) / ciro-gomes-gov-ce (Governador CE, publicavel=true)
--     -> allowlisted explicitamente em scripts/validate-seed.ts (ALLOWED_NAME_COLLISION_GROUPS)
--   tarcisio (Presidente, removido) / tarcisio-gov-sp (Governador SP, publicavel=true)
--     -> NAO allowlisted, mas inofensivo: 'tarcisio' nao esta mais no seed (ver secao 2)
--   fernando-haddad (Presidente, removido, wikidata/cpf nulos) / haddad-gov-sp (Governador SP, publicavel=true)
--     -> NAO allowlisted, mas inofensivo pelo mesmo motivo


-- ---------------------------------------------------------------------
-- 4) COERENCIA DE CAMPOS
-- ---------------------------------------------------------------------

-- 4.1 Governador/Vice-Governador/Senador/Deputado Federal sem estado
select slug, cargo_disputado, estado, status, publicavel
from public.candidatos
where cargo_disputado in ('Governador','Vice-Governador','Senador','Deputado Federal')
  and (estado is null or trim(estado)='');
-- Resultado: 0 linhas (limpo)

-- 4.2 cargo_disputado fora do enum do app (src/lib/types.ts)
select cargo_disputado, count(*) from public.candidatos
where cargo_disputado not in ('Presidente','Governador','Vice-Governador','Senador','Deputado Federal','Nenhum')
   or cargo_disputado is null
group by 1;
-- Resultado: 0 linhas (limpo)

-- 4.3 Presidente com estado preenchido (nao deveria, campo e "UF pra governadores")
select slug, cargo_disputado, estado from public.candidatos where cargo_disputado='Presidente' and estado is not null;
-- Resultado: eduardo-leite (RS) -- residuo de quando era tratado como Governador RS.
-- Nao publicavel (removido), sem impacto no site, mas e inconsistencia de dado.

-- 4.4 estado fora das 27 UFs validas
select estado, count(*) from public.candidatos
where estado is not null and estado not in
 ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')
group by 1;
-- Resultado: 0 linhas (limpo)

-- 4.5 status fora do enum TS (src/lib/types.ts: 'pre-candidato'|'candidato'|'indeferido'|'desistente'|'removido')
select status, count(*) from public.candidatos
where status not in ('pre-candidato','candidato','indeferido','desistente','removido')
group by 1;
-- Resultado: status='ativo', count=1 (slug marcio-franca). Valor nao existe em nenhum
-- lugar do codigo (grep 'ativo'.*status vazio em src/ e scripts/); linha nao foi tocada
-- desde 2026-06-09 (ultima_atualizacao). publicavel=false hoje, entao nao vaza, mas
-- viola o contrato de tipos do proprio app.

-- 4.6 situacao_candidatura: distribuicao geral e entre publicaveis
select situacao_candidatura, count(*), count(*) filter (where publicavel) as publicaveis
from public.candidatos
group by 1
order by 2 desc;
-- Publicaveis (195) = 179 'pre-candidato' + 15 'incerto' + 1 null.
-- Nao publicaveis carregam tambem formatos herdados de outro schema:
-- 'APTO [2022]' (8), 'APTO [2020]' (3), 'INAPTO [2022]' (1) -- formato de status
-- historico de candidatura TSE de ciclo passado, semanticamente diferente da
-- classificacao editorial 2026 ('pre-candidato'/'incerto'). Nao publicavel, sem
-- exposicao, mas mistura dois vocabularios na mesma coluna.

-- 4.7 Publicaveis com situacao_candidatura incerta/nula (relevante para a
-- premissa "cargo_disputado/situacao_candidatura sao declaracao editorial,
-- nao confirmada pelo TSE")
select slug, cargo_disputado, estado, situacao_candidatura
from public.candidatos
where publicavel = true and (situacao_candidatura is null or situacao_candidatura = 'incerto')
order by situacao_candidatura, slug;
-- 16 publicaveis (15 'incerto' + 1 null=ronaldo-caiado) expostos ao publico
-- com status de candidatura marcado como incerto/ausente pela propria curadoria.

-- 4.8 partido_sigla vs partido_atual entre publicaveis (todas as combinacoes)
select partido_sigla, partido_atual, count(*)
from public.candidatos
where publicavel = true
group by 1,2
order by 1;
-- Achados:
--  - 'PODE' (7 linhas) x 'PODEMOS' (1 linha, slug dr-daniel) para o mesmo partido
--    Podemos: partido_sigla nao normalizado antes de gravar (embora
--    resolveCanonicalPartySigla('PODEMOS') resolva certo para 'PODE' em runtime).
--  - partido_sigla 'PCB' (4 candidatos: tulio-lopes, camilo-terra, eudo-raffael,
--    edmilson-costa) NAO existe em CANONICAL_PARTIES de src/lib/party-utils.ts
--    (52 siglas). resolveCanonicalPartySigla('PCB') retorna null.
--  - partido_sigla 'MOBILIZA' (2 candidatos: mauricio-coelho, cabo-daciolo) tambem
--    ausente de CANONICAL_PARTIES (so existe 'PMN' com aliases "Mobilizacao
--    Nacional"/"Mobilização Nacional", nome antigo do mesmo partido).
--    Ambos SIGLAS aparecem em KNOWN_PARTIES/REMOTE_PARTY_LOGOS (src/lib/utils.ts),
--    entao o logo/selo do partido renderiza; o que quebra e qualquer feature que
--    dependa de resolveCanonicalPartySigla/canonicalPartiesEquivalent (troca de
--    partido, continuidade historica) para esses 7 candidatos publicaveis.


-- ---------------------------------------------------------------------
-- 5) IDENTIDADE IMPROVAVEL
-- ---------------------------------------------------------------------

-- 5.1 idade armazenada vs idade calculada a partir de data_nascimento (ref 2026-07-24)
select slug, data_nascimento, idade as idade_armazenada,
  date_part('year', age('2026-07-24'::date, data_nascimento)) as idade_calculada, publicavel
from public.candidatos
where data_nascimento is not null and idade is not null
  and idade <> date_part('year', age('2026-07-24'::date, data_nascimento))
order by publicavel desc, slug;
-- Resultado: 0 linhas (limpo, idade e data_nascimento sempre coerentes)

-- 5.2 Publicaveis sem data_nascimento
select count(*) from public.candidatos where publicavel=true and data_nascimento is null;
-- Resultado: 19/195 (9,7%) sem data de nascimento (ver elenco.md para a lista de slugs)

-- 5.3 data_nascimento absurda (antes de 1920 ou no futuro)
select slug, data_nascimento, publicavel from public.candidatos
where data_nascimento < '1920-01-01' or data_nascimento > '2026-07-24';
-- Resultado: 0 linhas (limpo)

-- 5.4 nome_urna vazio / foto_url vazio entre publicaveis
select
  count(*) filter (where nome_urna is null or trim(nome_urna)='') as nome_urna_vazio,
  count(*) filter (where foto_url is null or trim(foto_url)='') as sem_foto
from public.candidatos where publicavel = true;
-- Resultado: 0 e 0 (limpo)

-- 5.5 foto_url reaproveitada entre candidatos diferentes (mesma imagem, pessoas
-- diferentes seria bandeira vermelha de troca de foto)
select foto_url, array_agg(slug order by slug) as slugs, count(*)
from public.candidatos
where publicavel = true and foto_url is not null
group by foto_url
having count(*) > 1;
-- Resultado: 0 linhas (nenhuma foto_url duplicada entre publicaveis)

-- 5.6 Origem das foto_url entre publicaveis (proporcao por fonte)
select
  case
    when foto_url like '/candidates/%' then 'local /candidates/'
    when foto_url like '%wikimedia%' then 'wikimedia'
    when foto_url like '%tse.jus.br%' then 'tse'
    when foto_url like '%camara.leg.br%' then 'camara'
    when foto_url like '%senado.leg.br%' then 'senado'
    else 'outro'
  end as origem,
  count(*)
from public.candidatos where publicavel=true
group by 1 order by 2 desc;
-- wikimedia=87, local=50, tse=25, outro=19, camara=11, senado=3
-- Os 50 arquivos locais (/candidates/*) foram confirmados presentes em disco
-- (public/candidates/, 2026-07-24). As 145 URLs externas foram checadas por
-- HTTP HEAD/GET (script python em scratchpad); apenas 1 falhou de forma
-- reproduzivel: lucien-rezende -> https://cdn.jd1noticias.com/... -> HTTP 530
-- (Cloudflare, origem inalcancavel), confirmado 2x com >15s de intervalo.
-- Demais 200/429 do wikimedia foram rate-limiting do proprio script de
-- verificacao em lote, nao evidencia de quebra do lado do site (nao reportados
-- como achado por falta de reproducao limpa).


-- ---------------------------------------------------------------------
-- 6) IDs EXTERNOS (camara/senado/tse_sq_candidato) -- SEED x REALIDADE
-- ---------------------------------------------------------------------
-- Rodado via: npx tsx scripts/check-ids-cohort.ts --timeout-ms=8000 --max-retries=1
--   --output=.../ids-cohort-report.json   (2026-07-24)
-- Resultado: summary: ok=87 mismatch=0 not_found=0 error=0 skipped=0
-- Os 87 candidatos do seed com ids.camara ou ids.senado preenchidos batem
-- 100% (nome normalizado + UF quando aplicavel) com as APIs oficiais
-- dadosabertos.camara.leg.br e legis.senado.leg.br em 2026-07-24.
-- Isso cobre so 87/248 linhas (candidatos com mandato federal atual/recente);
-- os demais (a maioria dos Governador) nao tem id.camara/id.senado no seed
-- e portanto nao passam por este crosscheck.

-- validate:seed (regras internas de colisao de nome_urna/SQ/camara/senado
-- dentro do proprio seed) tambem rodado, 2026-07-24:
--   `npm run validate:seed` -> "validate-seed: OK (239 candidatos)"
