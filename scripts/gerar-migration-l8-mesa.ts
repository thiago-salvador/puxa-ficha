/**
 * Gera a migration e o readback da L8 (Mesa editorial de 29/09/2026) a partir
 * da lista fechada versionada em scripts/audit/allowlist-l8-mesa-20260929.json.
 *
 * Processos: INSERT no formato da L13 (DJEN reconsultado, cache privado fora do
 * repo), recibo coleta_log 'encontrado' por ficha que ganha processo, CNJ
 * completado em linhas já publicadas sem número (preimagem md5). Promessas:
 * verificar, inserir e despublicar vínculos com preimagem md5 e ROW_COUNT
 * exato. projetos_lei: autoria corrigida em metadata. Um recibo global guarda
 * pré e pós-imagem de toda linha alterada.
 *
 * Uso:
 *   node --import tsx scripts/gerar-migration-l8-mesa.ts --cache=<dir DJEN privado>
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  buscarComunicacoes,
  detalheRecibo,
  prepararLinhas,
  validarAprovados,
  type Aprovado,
  type ComunicacaoDjen,
  type Linha,
} from "./gerar-migration-processos-aprovados"
import { cnjValido } from "./gerar-migration-processos-curadoria"

const ALLOWLIST = "scripts/audit/allowlist-l8-mesa-20260929.json"
const STATUS_DJEN = "comunicacao_processual_publicada_merito_nao_inferido"
const FONTE_LOG = "processos-curadoria"
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/
const MD5 = /^[0-9a-f]{32}$/

interface InsercaoLista extends Aprovado {
  ajuste?: { descricao: string; tribunal: string; tipo: "criminal" | "civil" }
}

export interface ListaFechadaL8 {
  versao: string
  marcador: string
  revisao_em: string
  contagens: Record<string, number>
  processos: {
    inserir: InsercaoLista[]
    completar_cnj: Array<{ item_id: string; processo_id: string; slug: string; candidato_id: string; numero_cnj: string; status_novo: string | null; preimage_md5: string }>
    ocultar_no_site: Array<{ processo_id: string; numero_cnj: string; slug: string }>
  }
  promessas: {
    verificar: Array<{ id: string; slug: string; candidato_id: string; preimage_md5: string; item_ids: string[] }>
    inserir: Array<{ slug: string; candidato_id: string; programa_chave: string; tema_id: string; tipo_evidencia: string; evidencia_ref: string; item_ids: string[] }>
    despublicar: Array<{ id: string; slug: string; candidato_id: string; preimage_md5: string; item_ids: string[] }>
  }
  projetos_lei: { autoria: Array<{ id: string; candidato_id: string; papel: string; ordem: number; total: number; preimage_md5: string; item_id: string }> }
  motivos: { publicar: string; despublicar: string; revisado_por: string }
}

const sql = (valor: string) => `'${valor.replaceAll("'", "''").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()}'`
const digitos = (valor: string) => valor.replace(/\D/g, "")

export function validarLista(lista: ListaFechadaL8): void {
  if (!/^\d{14}$/.test(lista.versao) || !/^\d{4}-\d{2}-\d{2}$/.test(lista.revisao_em)) throw new Error("versao ou revisao invalida")
  const ids = (xs: Array<{ id?: string; processo_id?: string; candidato_id: string; preimage_md5?: string }>) => {
    for (const x of xs) {
      const id = x.id ?? x.processo_id
      if (!id || !UUID.test(id) || !UUID.test(x.candidato_id)) throw new Error(`uuid invalido: ${id}`)
      if (x.preimage_md5 !== undefined && !MD5.test(x.preimage_md5)) throw new Error(`${id}: preimagem invalida`)
    }
  }
  ids(lista.processos.completar_cnj)
  ids(lista.promessas.verificar)
  ids(lista.promessas.despublicar)
  ids(lista.projetos_lei.autoria)
  for (const x of lista.processos.completar_cnj) if (!cnjValido(x.numero_cnj)) throw new Error(`${x.numero_cnj}: CNJ invalido`)
  const duplicados = (xs: string[]) => xs.length !== new Set(xs).size
  if (duplicados([...lista.promessas.verificar, ...lista.promessas.despublicar].map((x) => x.id))) throw new Error("vinculo repetido")
  if (duplicados(lista.processos.completar_cnj.map((x) => x.processo_id))) throw new Error("linha omit repetida")
  const c = lista.contagens
  const confere: Array<[string, number]> = [
    ["processos_inserir", lista.processos.inserir.length],
    ["processos_completar_cnj", lista.processos.completar_cnj.length],
    ["promessas_verificar", lista.promessas.verificar.length],
    ["promessas_inserir", lista.promessas.inserir.length],
    ["promessas_despublicar", lista.promessas.despublicar.length],
    ["projetos_autoria", lista.projetos_lei.autoria.length],
  ]
  for (const [nome, n] of confere) if (c[nome] !== n) throw new Error(`contagem ${nome}: lista ${n}, declarada ${c[nome]}`)
}

export function linhasProcessos(lista: ListaFechadaL8, comunicacoes: Map<string, ComunicacaoDjen[]>): Linha[] {
  const aprovados: Aprovado[] = lista.processos.inserir.map((a) => ({
    slug: a.slug, candidato_id: a.candidato_id, numero_cnj: a.numero_cnj, tribunal: a.tribunal, classe: a.classe,
    orgao: a.orgao, polo: a.polo, papel: a.papel, tipo: a.tipo, decisao_ref: a.decisao_ref,
  }))
  const evidencia = aprovados.map((a) => ({ slug: a.slug, numero_cnj: a.numero_cnj, tribunal: a.tribunal, classe: a.classe, orgao: a.orgao, polo: a.polo }))
  const fichas = new Set(aprovados.map((a) => a.slug)).size
  const validados = validarAprovados(aprovados, evidencia, lista.contagens.processos_inserir, fichas)
  const linhas = prepararLinhas(validados, comunicacoes, lista.marcador)
  const ajustes = new Map(lista.processos.inserir.filter((a) => a.ajuste).map((a) => [a.numero_cnj, a.ajuste!]))
  return linhas.map((linha) => {
    const ajuste = ajustes.get(linha.numero)
    return ajuste ? { ...linha, descricao: ajuste.descricao, tribunal: ajuste.tribunal, tipo: ajuste.tipo } : linha
  })
}

export function gerarMigrationL8(lista: ListaFechadaL8, linhas: Linha[]) {
  validarLista(lista)
  const v = lista.versao
  const nome = "l8_mesa_processos_promessas"
  const exec = `migration:${v}`
  const ref = lista.marcador
  const total = linhas.length
  const fichas = new Set(linhas.map((l) => l.slug)).size
  const completar = lista.processos.completar_cnj
  const corrigidos = completar.filter((x) => x.status_novo).length
  const { verificar, inserir: novas, despublicar } = lista.promessas
  const autoria = lista.projetos_lei.autoria
  const { publicar: motivoPub, despublicar: motivoDes, revisado_por: revisor } = lista.motivos
  const [ano, mes, dia] = lista.revisao_em.split("-")
  const instante = `${lista.revisao_em}T02:00:00Z`

  const porSlug = new Map<string, Linha[]>()
  for (const l of linhas) porSlug.set(l.slug, [...(porSlug.get(l.slug) ?? []), l])
  const recibos = [...porSlug.values()].map((xs) => {
    const apis = xs.flatMap((x) => x.urlsApi).sort()
    return `  (${sql(xs[0].slug)}, ${sql(xs[0].candidatoId)}::uuid, ${xs.length}, ${sql(apis[0])}, ${sql(detalheRecibo(xs.length, apis, lista.revisao_em))})`
  })

  const dadosProcessos = linhas.map((x) =>
    `  (${[x.slug, x.candidatoId, x.tipo, x.tribunal, x.numero, x.descricao, STATUS_DJEN, x.fonte, x.url].map(sql).join(", ")})`)
  const insertsProcessos = linhas.map((l) => `  -- @write tabela=processos slug=${l.slug} campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
  INSERT INTO public.processos
    (candidato_id, tipo, tribunal, numero_processo, descricao, status,
     data_inicio, data_decisao, gravidade, fonte, url_fonte)
  SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
         NULL, NULL, NULL, l.fonte, l.url_fonte
  FROM _pf_processos_curadoria l
  JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
  WHERE l.slug = ${sql(l.slug)} AND l.numero_cnj = ${sql(l.numero)};
  GET DIAGNOSTICS n = ROW_COUNT; soma := soma + n;`).join("\n")

  const valores = <T>(xs: T[], f: (x: T) => string) => xs.length ? xs.map(f).join(",\n") : null
  const tabelaCnj = valores(completar, (x) =>
    `  (${sql(x.processo_id)}::uuid, ${sql(x.slug)}, ${sql(x.candidato_id)}::uuid, ${sql(x.numero_cnj)}, ${x.status_novo ? sql(x.status_novo) : "NULL"}, ${sql(x.preimage_md5)}, ${sql(lista.marcador)})`)
  const tabelaVinculos = valores([...verificar.map((x) => ({ ...x, acao: "verificar" })), ...despublicar.map((x) => ({ ...x, acao: "despublicar" }))], (x) =>
    `  (${sql(x.id)}::uuid, ${sql(x.acao)}, ${sql(x.slug)}, ${sql(x.candidato_id)}::uuid, ${sql(x.preimage_md5)})`)
  const tabelaNovas = valores(novas, (x) =>
    `  (${[x.slug].map(sql)}, ${sql(x.candidato_id)}::uuid, ${[x.programa_chave, x.tema_id, x.tipo_evidencia, x.evidencia_ref].map(sql).join(", ")})`)
  const tabelaAutoria = valores(autoria, (x) =>
    `  (${sql(x.id)}::uuid, ${sql(x.candidato_id)}::uuid, ${sql(x.papel)}, ${x.ordem}, ${x.total}, ${sql(x.preimage_md5)})`)
  if (!tabelaCnj || !tabelaVinculos || !tabelaNovas || !tabelaAutoria) throw new Error("lista L8 incompleta: gerador espera as quatro partes")

  const migration = `-- ${v}_${nome}.sql
-- L8, decisões da Mesa editorial de ${dia}/${mes}/${ano}. APROVADO, NAO APLICADO.
-- Lista fechada: ${"scripts/audit/allowlist-l8-mesa-20260929.json"} (chave lista_fechada),
-- gerada por scripts/audit/derivar-lista-l8-mesa.ts e scripts/gerar-migration-l8-mesa.ts.
-- Processos: ${total} CNJs novos em ${fichas} fichas (DJEN reconsultado, marcador ${lista.marcador}),
-- ${completar.length} linhas já publicadas ganham o CNJ (${corrigidos} com status corrigido) e
-- ${fichas} recibos coleta_log 'encontrado'. Promessas: ${verificar.length} vínculo verificado,
-- ${novas.length} inseridos e ${despublicar.length} retirados da ficha. projetos_lei: ${autoria.length}
-- autoria corrigida (signatário, não autor). Toda linha alterada tem preimagem md5
-- medida em produção; divergência aborta a transação inteira.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.processos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.compromisso_evidencia IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.projetos_lei IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.coleta_log IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _pf_processos_curadoria (
  slug text NOT NULL, candidato_id uuid NOT NULL, tipo text NOT NULL,
  tribunal text NOT NULL, numero_cnj text NOT NULL, descricao text NOT NULL,
  status text NOT NULL, fonte text NOT NULL, url_fonte text NOT NULL,
  PRIMARY KEY (slug, numero_cnj)
) ON COMMIT DROP;
INSERT INTO _pf_processos_curadoria
  (slug, candidato_id, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
${dadosProcessos.join(",\n")};

CREATE TEMP TABLE _pf_l8_recibos (
  slug text PRIMARY KEY, candidato_id uuid NOT NULL, volume integer NOT NULL,
  url text NOT NULL, detalhe text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_recibos VALUES
${recibos.join(",\n")};

CREATE TEMP TABLE _pf_l8_processos_cnj (
  processo_id uuid PRIMARY KEY, slug text NOT NULL, candidato_id uuid NOT NULL,
  numero_cnj text NOT NULL, status_novo text, preimage_md5 text NOT NULL,
  lote text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_processos_cnj VALUES
${tabelaCnj};

CREATE TEMP TABLE _pf_l8_vinculos (
  id uuid PRIMARY KEY, acao text NOT NULL CHECK (acao IN ('verificar', 'despublicar')),
  slug text NOT NULL, candidato_id uuid NOT NULL, preimage_md5 text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_vinculos VALUES
${tabelaVinculos};

CREATE TEMP TABLE _pf_l8_vinculos_novos (
  slug text NOT NULL, candidato_id uuid NOT NULL, programa_chave text NOT NULL,
  tema_id text NOT NULL, tipo_evidencia text NOT NULL, evidencia_ref text NOT NULL,
  PRIMARY KEY (programa_chave, tema_id, tipo_evidencia, evidencia_ref)
) ON COMMIT DROP;
INSERT INTO _pf_l8_vinculos_novos VALUES
${tabelaNovas};

CREATE TEMP TABLE _pf_l8_autoria (
  id uuid PRIMARY KEY, candidato_id uuid NOT NULL, papel text NOT NULL,
  ordem integer NOT NULL, total integer NOT NULL, preimage_md5 text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_l8_autoria VALUES
${tabelaAutoria};

CREATE TEMP TABLE _pf_l8_antes (tabela text NOT NULL, id uuid NOT NULL, antes jsonb NOT NULL, PRIMARY KEY (tabela, id)) ON COMMIT DROP;

DO $apply$
DECLARE n integer; soma integer := 0; v timestamptz := timestamptz ${sql(instante)};
BEGIN
  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'l8-mesa: apenas replay descartável; sem escrita';
    RETURN;
  END IF;

  -- Identidade, contagens fechadas e preimagens: qualquer divergência aborta.
  IF (SELECT count(*) FROM _pf_processos_curadoria) <> ${total}
     OR (SELECT count(DISTINCT slug) FROM _pf_processos_curadoria) <> ${fichas}
     OR (SELECT count(*) FROM _pf_l8_recibos) <> ${fichas}
     OR (SELECT count(*) FROM _pf_l8_processos_cnj) <> ${completar.length}
     OR (SELECT count(*) FROM _pf_l8_vinculos WHERE acao = 'verificar') <> ${verificar.length}
     OR (SELECT count(*) FROM _pf_l8_vinculos WHERE acao = 'despublicar') <> ${despublicar.length}
     OR (SELECT count(*) FROM _pf_l8_vinculos_novos) <> ${novas.length}
     OR (SELECT count(*) FROM _pf_l8_autoria) <> ${autoria.length}
  THEN RAISE EXCEPTION 'l8-mesa: lista fechada divergiu das contagens'; END IF;

  IF EXISTS (SELECT 1 FROM (
       SELECT slug, candidato_id FROM _pf_processos_curadoria
       UNION SELECT slug, candidato_id FROM _pf_l8_processos_cnj
       UNION SELECT slug, candidato_id FROM _pf_l8_vinculos
       UNION SELECT slug, candidato_id FROM _pf_l8_vinculos_novos) u
     LEFT JOIN public.candidatos c ON c.id = u.candidato_id AND c.slug = u.slug
     WHERE c.id IS NULL)
  THEN RAISE EXCEPTION 'l8-mesa: identidade de ficha divergente'; END IF;

  IF EXISTS (SELECT 1 FROM public.processos p JOIN (
       SELECT numero_cnj FROM _pf_processos_curadoria UNION SELECT numero_cnj FROM _pf_l8_processos_cnj) l
     ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g'))
  THEN RAISE EXCEPTION 'l8-mesa: CNJ do lote já existe em produção; recusar duplicação ou lote parcial'; END IF;

  IF (SELECT count(*) FROM public.processos p JOIN _pf_l8_processos_cnj u
        ON u.processo_id = p.id AND u.candidato_id = p.candidato_id
      WHERE p.numero_processo IS NULL AND md5(to_jsonb(p)::text) = u.preimage_md5) <> ${completar.length}
     OR (SELECT count(*) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos u
        ON u.id = e.id AND u.candidato_id = e.candidato_id
      WHERE md5(to_jsonb(e)::text) = u.preimage_md5
        AND e.relacao IN ('sustenta', 'relacionada')
        AND ((u.acao = 'verificar' AND NOT e.verificado)
          OR (u.acao = 'despublicar' AND public.is_public_compromisso_evidencia(e.id)))) <> ${verificar.length + despublicar.length}
     OR (SELECT count(*) FROM public.projetos_lei p JOIN _pf_l8_autoria u
        ON u.id = p.id AND u.candidato_id = p.candidato_id
      WHERE md5(to_jsonb(p)::text) = u.preimage_md5 AND p.tipo = 'PEC' AND p.despublicado_em IS NULL) <> ${autoria.length}
  THEN RAISE EXCEPTION 'l8-mesa: preimagem divergiu'; END IF;

  IF EXISTS (SELECT 1 FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos_novos u
       ON e.programa_chave = u.programa_chave AND e.frase_id IS NULL AND e.tema_id = u.tema_id
      AND e.tipo_evidencia = u.tipo_evidencia AND e.evidencia_ref = u.evidencia_ref)
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = ${sql(exec)})
  THEN RAISE EXCEPTION 'l8-mesa: vínculo novo ou recibo já existe'; END IF;

  INSERT INTO _pf_l8_antes
  SELECT 'processos', p.id, to_jsonb(p) FROM public.processos p JOIN _pf_l8_processos_cnj u ON u.processo_id = p.id
  UNION ALL
  SELECT 'compromisso_evidencia', e.id, to_jsonb(e) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos u ON u.id = e.id
  UNION ALL
  SELECT 'projetos_lei', p.id, to_jsonb(p) FROM public.projetos_lei p JOIN _pf_l8_autoria u ON u.id = p.id;

  -- Processos novos, um statement por CNJ.
${insertsProcessos}
  IF soma <> ${total} THEN RAISE EXCEPTION 'l8-mesa: processos inseridos %', soma; END IF;

  -- @write tabela=processos ref=${ref} campos=numero_processo,status
  UPDATE public.processos p SET numero_processo = u.numero_cnj,
    status = COALESCE(u.status_novo, p.status)
  FROM _pf_l8_processos_cnj u
  WHERE p.id = u.processo_id AND p.candidato_id = u.candidato_id
    AND u.lote = ${sql(lista.marcador)} AND md5(to_jsonb(p)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> ${completar.length} THEN RAISE EXCEPTION 'l8-mesa: CNJs completados %', n; END IF;

  -- @write tabela=coleta_log ref=${exec} campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log
    (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
  SELECT ${sql(FONTE_LOG)}, 'candidato', r.slug, r.candidato_id, 'encontrado', r.volume,
         r.detalhe, r.url, ${sql(exec)}, 'coleta'
  FROM _pf_l8_recibos r JOIN public.candidatos c ON c.id = r.candidato_id AND c.slug = r.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> ${fichas} THEN RAISE EXCEPTION 'l8-mesa: recibos de processos %', n; END IF;

  -- @write tabela=compromisso_evidencia ref=${ref} campos=verificado,revisado_por,revisado_em,motivo,updated_at
  UPDATE public.compromisso_evidencia e SET verificado = true, revisado_por = ${sql(revisor)},
    revisado_em = v, motivo = ${sql(motivoPub)}, updated_at = v
  FROM _pf_l8_vinculos u
  WHERE u.acao = 'verificar' AND e.id = u.id AND e.candidato_id = u.candidato_id
    AND md5(to_jsonb(e)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> ${verificar.length} THEN RAISE EXCEPTION 'l8-mesa: vínculos verificados %', n; END IF;

  -- @write tabela=compromisso_evidencia ref=${ref} campos=verificado,revisado_por,revisado_em,motivo,updated_at
  UPDATE public.compromisso_evidencia e SET verificado = false, revisado_por = ${sql(revisor)},
    revisado_em = v, motivo = ${sql(motivoDes)}, updated_at = v
  FROM _pf_l8_vinculos u
  WHERE u.acao = 'despublicar' AND e.id = u.id AND e.candidato_id = u.candidato_id
    AND md5(to_jsonb(e)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> ${despublicar.length} THEN RAISE EXCEPTION 'l8-mesa: vínculos retirados %', n; END IF;

  -- @write tabela=compromisso_evidencia ref=${ref} campos=candidato_id,programa_chave,frase_id,tema_id,tipo_evidencia,evidencia_ref,relacao,origem,probabilidade,verificado,revisado_por,revisado_em,motivo
  INSERT INTO public.compromisso_evidencia
    (candidato_id, programa_chave, frase_id, tema_id, tipo_evidencia, evidencia_ref,
     relacao, origem, probabilidade, verificado, revisado_por, revisado_em, motivo)
  SELECT u.candidato_id, u.programa_chave, NULL, u.tema_id, u.tipo_evidencia, u.evidencia_ref,
         'relacionada', 'curadoria', NULL, true, ${sql(revisor)}, v, ${sql(motivoPub)}
  FROM _pf_l8_vinculos_novos u JOIN public.candidatos c ON c.id = u.candidato_id AND c.slug = u.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> ${novas.length} THEN RAISE EXCEPTION 'l8-mesa: vínculos inseridos %', n; END IF;

  -- @write tabela=projetos_lei ref=${ref} campos=metadata
  UPDATE public.projetos_lei p SET metadata = COALESCE(p.metadata, '{}'::jsonb)
    || jsonb_build_object('autoria', jsonb_build_object('papel', u.papel, 'ordem', u.ordem, 'total', u.total,
         'fonte', 'Câmara dos Deputados, Dados Abertos', 'revisado_em', ${sql(lista.revisao_em)},
         'lote', ${sql(lista.marcador)}))
  FROM _pf_l8_autoria u
  WHERE p.id = u.id AND p.candidato_id = u.candidato_id AND md5(to_jsonb(p)::text) = u.preimage_md5;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> ${autoria.length} THEN RAISE EXCEPTION 'l8-mesa: autoria %', n; END IF;

  -- Pós-condição: o que a ficha passa a mostrar.
  IF (SELECT count(*) FROM _pf_processos_curadoria l WHERE (SELECT count(*) FROM public.processos p
        WHERE p.candidato_id = l.candidato_id AND p.fonte = l.fonte
          AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')) <> 1) <> 0
     OR (SELECT count(*) FROM public.processos p JOIN _pf_l8_processos_cnj u ON u.processo_id = p.id
        WHERE p.numero_processo = u.numero_cnj AND (u.status_novo IS NULL OR p.status = u.status_novo)) <> ${completar.length}
     OR (SELECT count(*) FROM _pf_l8_vinculos u WHERE u.acao = 'verificar' AND public.is_public_compromisso_evidencia(u.id)) <> ${verificar.length}
     OR (SELECT count(*) FROM _pf_l8_vinculos u WHERE u.acao = 'despublicar' AND NOT public.is_public_compromisso_evidencia(u.id)) <> ${despublicar.length}
     OR (SELECT count(*) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos_novos u
        ON e.programa_chave = u.programa_chave AND e.frase_id IS NULL AND e.tema_id = u.tema_id
       AND e.tipo_evidencia = u.tipo_evidencia AND e.evidencia_ref = u.evidencia_ref
        WHERE public.is_public_compromisso_evidencia(e.id)) <> ${novas.length}
     OR (SELECT count(*) FROM public.projetos_lei p JOIN _pf_l8_autoria u ON u.id = p.id
        WHERE p.metadata->'autoria'->>'papel' = u.papel AND (p.metadata->'autoria'->>'ordem')::int = u.ordem) <> ${autoria.length}
  THEN RAISE EXCEPTION 'l8-mesa: pós-condição falhou'; END IF;

  -- @write tabela=coleta_log ref=${exec} campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'curadoria-l8-mesa', 'global', 'processos,compromisso_evidencia,projetos_lei', 'encontrado',
    ${total + completar.length + verificar.length + despublicar.length + novas.length + autoria.length},
    jsonb_build_object(
      'resumo', ${sql(`Mesa L8: ${total} processos novos, ${completar.length} CNJs completados, ${verificar.length + novas.length} vínculos de promessa publicados, ${despublicar.length} retirados e ${autoria.length} autoria corrigida.`)},
      'processos_novos', (SELECT jsonb_agg(jsonb_build_object('slug', l.slug, 'numero_processo', l.numero_cnj) ORDER BY l.slug, l.numero_cnj) FROM _pf_processos_curadoria l),
      'vinculos_novos', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.compromisso_evidencia e JOIN _pf_l8_vinculos_novos u
        ON e.programa_chave = u.programa_chave AND e.frase_id IS NULL AND e.tema_id = u.tema_id
       AND e.tipo_evidencia = u.tipo_evidencia AND e.evidencia_ref = u.evidencia_ref),
      'linhas', (SELECT jsonb_agg(jsonb_build_object('tabela', a.tabela, 'id', a.id, 'before', a.antes, 'after', CASE a.tabela
          WHEN 'processos' THEN (SELECT to_jsonb(p) FROM public.processos p WHERE p.id = a.id)
          WHEN 'compromisso_evidencia' THEN (SELECT to_jsonb(e) FROM public.compromisso_evidencia e WHERE e.id = a.id)
          ELSE (SELECT to_jsonb(p) FROM public.projetos_lei p WHERE p.id = a.id) END) ORDER BY a.tabela, a.id)
        FROM _pf_l8_antes a))::text,
    'https://comunica.pje.jus.br/', ${sql(exec)}, 'escrita';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'l8-mesa: recibo global %', n; END IF;
END
$apply$;
COMMIT;
`

  const esperadosProcessos = linhas.map((x) => `    (${sql(x.slug)}, ${sql(x.candidatoId)}::uuid, ${sql(x.numero)}, ${sql(x.fonte)})`).join(",\n")
  const readback = `-- READBACK SOMENTE LEITURA de ${v}_${nome}.sql
DO $readback$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations WHERE version = ${sql(v)};
  IF n <> 1 THEN RAISE EXCEPTION 'readback l8-mesa: ledger=%', n; END IF;

  WITH e(slug, candidato_id, numero_cnj, fonte) AS (VALUES
${esperadosProcessos}
  ) SELECT count(*) INTO n FROM e WHERE
    (SELECT count(*) FROM public.candidatos c JOIN public.processos p ON p.candidato_id = c.id
      WHERE c.id = e.candidato_id AND c.slug = e.slug AND p.fonte = e.fonte
        AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1
    OR (SELECT count(*) FROM public.processos p
      WHERE regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1;
  IF n <> 0 THEN RAISE EXCEPTION 'readback l8-mesa: % CNJs novos ausentes ou duplicados (esperados ${total})', n; END IF;
  SELECT count(*) INTO n FROM public.processos WHERE fonte LIKE ${sql(`${lista.marcador}: %`)};
  IF n <> ${total} THEN RAISE EXCEPTION 'readback l8-mesa: marcador=% (esperado ${total})', n; END IF;

  WITH e(id, candidato_id, numero_cnj) AS (VALUES
${completar.map((x) => `    (${sql(x.processo_id)}::uuid, ${sql(x.candidato_id)}::uuid, ${sql(x.numero_cnj)})`).join(",\n")}
  ) SELECT count(*) INTO n FROM e JOIN public.processos p ON p.id = e.id AND p.candidato_id = e.candidato_id AND p.numero_processo = e.numero_cnj;
  IF n <> ${completar.length} THEN RAISE EXCEPTION 'readback l8-mesa: CNJs completados=% (esperados ${completar.length})', n; END IF;

  WITH e(slug, candidato_id, volume, url, detalhe) AS (VALUES
${recibos.map((r) => `  ${r}`).join(",\n")}
  ) SELECT count(*) INTO n FROM e JOIN public.coleta_log_ultima l
    ON l.fonte = ${sql(FONTE_LOG)} AND l.escopo = 'candidato' AND l.alvo = e.slug
   AND l.candidato_id = e.candidato_id AND l.resultado = 'encontrado'
   AND l.volume = e.volume AND l.url = e.url AND l.detalhe = e.detalhe AND l.execucao = ${sql(exec)};
  IF n <> ${fichas} THEN RAISE EXCEPTION 'readback l8-mesa: recibos atuais=% (esperados ${fichas})', n; END IF;

  SELECT count(*) INTO n FROM public.compromisso_evidencia_publica WHERE id IN (${verificar.map((x) => `${sql(x.id)}::uuid`).join(", ")});
  IF n <> ${verificar.length} THEN RAISE EXCEPTION 'readback l8-mesa: verificados públicos=%', n; END IF;
  SELECT count(*) INTO n FROM public.compromisso_evidencia_publica WHERE id IN (${despublicar.map((x) => `${sql(x.id)}::uuid`).join(", ")});
  IF n <> 0 THEN RAISE EXCEPTION 'readback l8-mesa: retirados ainda públicos=%', n; END IF;
  WITH e(programa_chave, tema_id, tipo_evidencia, evidencia_ref) AS (VALUES
${novas.map((x) => `    (${[x.programa_chave, x.tema_id, x.tipo_evidencia, x.evidencia_ref].map(sql).join(", ")})`).join(",\n")}
  ) SELECT count(*) INTO n FROM e JOIN public.compromisso_evidencia_publica p
    ON p.programa_chave = e.programa_chave AND p.tema_id = e.tema_id
   AND p.tipo_evidencia = e.tipo_evidencia AND p.evidencia_ref = e.evidencia_ref;
  IF n <> ${novas.length} THEN RAISE EXCEPTION 'readback l8-mesa: vínculos novos públicos=%', n; END IF;
  SELECT count(*) INTO n FROM public.projetos_lei
   WHERE id IN (${autoria.map((x) => `${sql(x.id)}::uuid`).join(", ")}) AND metadata->'autoria'->>'papel' = 'signatario';
  IF n <> ${autoria.length} THEN RAISE EXCEPTION 'readback l8-mesa: autoria=%', n; END IF;
  SELECT count(*) INTO n FROM public.coleta_log WHERE execucao = ${sql(exec)} AND fonte = 'curadoria-l8-mesa';
  IF n <> 1 THEN RAISE EXCEPTION 'readback l8-mesa: recibo global=%', n; END IF;
  RAISE NOTICE 'readback l8-mesa: ${total} CNJs novos, ${completar.length} completados, ${fichas} recibos, promessas ${verificar.length}+${novas.length}/-${despublicar.length}, autoria ${autoria.length}';
END
$readback$;
`
  return { migration, readback, nome, counts: { processos: total, fichas, completar: completar.length, corrigidos } }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const valor = (nome: string) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const cache = valor("cache")
  if (!cache) throw new Error("--cache=<diretorio DJEN privado> e obrigatorio")
  const allow = JSON.parse(readFileSync(resolve(valor("allowlist") ?? ALLOWLIST), "utf8")) as { lista_fechada: ListaFechadaL8 }
  const lista = allow.lista_fechada
  validarLista(lista)
  const comunicacoes = new Map<string, ComunicacaoDjen[]>()
  for (const item of lista.processos.inserir) {
    const d = digitos(item.numero_cnj)
    if (!comunicacoes.has(d)) comunicacoes.set(d, await buscarComunicacoes(item.numero_cnj, resolve(cache)))
  }
  const linhas = linhasProcessos(lista, comunicacoes)
  const pacote = gerarMigrationL8(lista, linhas)
  writeFileSync(`supabase/migrations/${lista.versao}_${pacote.nome}.sql`, pacote.migration)
  writeFileSync(`supabase/readback/${lista.versao}_${pacote.nome}.readback.sql`, pacote.readback)
  console.log(JSON.stringify(pacote.counts))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  })
}
