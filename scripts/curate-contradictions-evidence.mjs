#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const { stripAccents } = require("../src/lib/strip-accents.ts");

const DEFAULT_OUT =
  "/Users/thiagosalvador/.disposable-html/2026-08-05-puxa-ficha-contradicoes-curadoria.evidence.json";

function flag(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function loadEnv(path) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    const raw = match[2].trim();
    process.env[match[1]] = raw.replace(/^(["'])(.*)\1$/, "$2");
  }
}

function semAcentos(value) {
  return stripAccents(String(value ?? ""))
    .toLowerCase();
}

async function getJson(path) {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key)
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${base}/rest/v1/${path}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: "application/json",
      prefer: "count=exact",
      range: "0-999",
    },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

function previousBySlug(outPath) {
  try {
    const current = JSON.parse(readFileSync(outPath, "utf8"));
    return {
      candidates: new Map(
        (current.candidates ?? []).map((item) => [item.slug, item]),
      ),
      batches: current.batches ?? [],
      createdAt: current.created_at ?? null,
    };
  } catch {
    return { candidates: new Map(), batches: [], createdAt: null };
  }
}

async function main() {
  const envPath = flag("env", ".env.local");
  const outPath = flag("out", DEFAULT_OUT);
  loadEnv(envPath);

  const select = [
    "id",
    "slug",
    "nome_completo",
    "nome_urna",
    "partido_sigla",
    "cargo_atual",
    "cargo_disputado",
    "estado",
    "biografia",
    "site_campanha",
    "redes_sociais",
    "fonte_dados",
    "posicoes_declaradas(tema,posicao,descricao,fonte,url_fonte,verificado,created_at)",
    "noticias_candidato(titulo,fonte,url,data_publicacao,snippet)",
    "historico_politico(cargo,periodo_inicio,periodo_fim,partido,estado,eleito_por,observacoes,tipo_evento,proveniencia)",
    "pontos_atencao(categoria,titulo,descricao,fontes,dados_relacionados,gravidade,verificado,visivel,data_referencia,gerado_por)",
    "votos_candidato(voto,contradicao,contradicao_descricao,votacoes_chave(titulo,descricao,data_votacao,casa,proposicao_id,tema))",
  ].join(",");

  const rows = await getJson(
    `candidatos?publicavel=eq.true&select=${encodeURIComponent(select)}&order=slug.asc`,
  );
  const previous = previousBySlug(outPath);
  const now = new Date().toISOString();

  const candidates = rows.map((row, index) => {
    const prior = previous.candidates.get(row.slug);
    const stored = {
      biografia: row.biografia,
      posicoes: row.posicoes_declaradas ?? [],
      noticias: row.noticias_candidato ?? [],
      historico_politico: row.historico_politico ?? [],
      pontos_atencao: row.pontos_atencao ?? [],
      votos: row.votos_candidato ?? [],
    };
    const existingContradictions = [
      ...stored.pontos_atencao.filter(
        (item) => semAcentos(item.categoria) === "contradicao",
      ),
      ...stored.votos.filter((item) => item.contradicao === true),
    ];

    return {
      ...prior,
      id: row.id,
      slug: row.slug,
      batch: Math.floor(index / 20) + 1,
      identity: {
        nome_completo: row.nome_completo,
        nome_urna: row.nome_urna,
        partido_sigla: row.partido_sigla,
        cargo_atual: row.cargo_atual,
        cargo_disputado: row.cargo_disputado,
        estado: row.estado,
        site_campanha: row.site_campanha,
        redes_sociais: row.redes_sociais,
        fonte_dados: row.fonte_dados,
      },
      stored,
      existing_contradictions: existingContradictions,
      classification: prior?.classification ?? "pendente",
      research: prior?.research ?? null,
      review_item: prior?.review_item ?? null,
      updated_at: prior?.updated_at ?? null,
    };
  });

  const artifact = {
    schema_version: 1,
    created_at: previous.createdAt ?? now,
    refreshed_at: now,
    supabase_ref: "wskpzsobvqwhnbsdsmok",
    base_commit: "022d3ed292b6f0918636c813cf5271e615999809",
    branch: "codex/contradicoes-curadoria-20260805",
    batch_size: 20,
    honest_empty_state: "curadoria concluída sem achado no escopo",
    caveat:
      "Uma ausência de achado no recorte pesquisado não prova ausência absoluta de contradições.",
    cohort_initial_count: candidates.length,
    cohort_initial_slugs: candidates.map((item) => item.slug),
    batches: previous.batches,
    candidates,
    summary: {
      total: candidates.length,
      pendentes: candidates.filter((item) => item.classification === "pendente")
        .length,
      concluidas_sem_achado: candidates.filter(
        (item) => item.classification === "sem_achado_no_escopo",
      ).length,
      pares_candidatos: candidates.filter(
        (item) => item.classification === "par_candidato",
      ).length,
      bloqueios: candidates.filter(
        (item) => item.classification === "bloqueado",
      ).length,
      descartes: candidates.reduce(
        (sum, item) => sum + (item.research?.discarded?.length ?? 0),
        0,
      ),
      aprovacoes_dependentes_thiago: candidates.filter(
        (item) => item.review_item,
      ).length,
    },
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      out: outPath,
      cohort: candidates.length,
      batches: Math.ceil(candidates.length / 20),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
