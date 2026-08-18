#!/usr/bin/env node

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const evidencePath = process.argv[2];
const decisionsPath = process.argv[3];
const searchRoot = process.argv[4];
if (!evidencePath || !decisionsPath || !searchRoot) {
  throw new Error(
    "usage: finalize-contradiction-curation-evidence.mjs <evidence.json> <decisions.json> <search-root>",
  );
}

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
const completedAt = new Date().toISOString();
const pairBySlug = new Map(decisions.pairs.map((item) => [item.slug, item]));
const blockedBySlug = new Map(
  decisions.blocked.map((item) => [item.slug, item]),
);
const discardsBySlug = new Map();
for (const discard of decisions.discards) {
  const current = discardsBySlug.get(discard.slug) ?? [];
  current.push(discard);
  discardsBySlug.set(discard.slug, current);
}

function publicSearchResults(candidate) {
  const path = join(
    searchRoot,
    `batch-${String(candidate.batch).padStart(2, "0")}`,
    `${candidate.slug}.json`,
  );
  if (!existsSync(path)) return { path: null, results: [] };
  const payload = JSON.parse(readFileSync(path, "utf8"));
  const results = Array.isArray(payload)
    ? payload
    : (payload.data?.web ?? payload.web ?? payload.data ?? []);
  return { path, results: Array.isArray(results) ? results : [] };
}

for (const candidate of evidence.candidates) {
  const pair = pairBySlug.get(candidate.slug);
  const blocked = blockedBySlug.get(candidate.slug);
  const discards = discardsBySlug.get(candidate.slug) ?? [];
  const publicSearch = publicSearchResults(candidate);
  const searchUrls = publicSearch.results
    .map((item) => item.url)
    .filter(Boolean);
  const storedUrls = [
    ...(candidate.stored?.noticias ?? []).map((item) => item.url),
    ...(candidate.stored?.posicoes ?? [])
      .flatMap((item) => item.fontes ?? [])
      .map((item) => item.url),
    ...(candidate.stored?.pontos_atencao ?? [])
      .flatMap((item) => item.fontes ?? [])
      .map((item) => item.url),
  ].filter(Boolean);

  candidate.updated_at = completedAt;
  candidate.research = {
    completed_at: completedAt,
    scope:
      "Dados armazenados, busca pública por declarações/ações comparáveis e aprofundamento dos sinais editoriais; ausência de achado limitada a este escopo.",
    public_search_file: publicSearch.path,
    consulted_urls: [
      ...new Set([
        ...storedUrls,
        ...searchUrls,
        ...(pair?.consulted_urls ?? []),
      ]),
    ],
    discards,
    note:
      blocked?.reason ??
      pair?.neutral_explanation ??
      decisions.default_no_finding_note,
  };

  if (pair) {
    candidate.classification = "par_candidato";
    candidate.review_item = {
      status: "aguardando_aprovacao_thiago",
      publish_automatically: false,
      ...pair,
    };
  } else if (blocked) {
    candidate.classification = "bloqueado";
    candidate.review_item = null;
  } else {
    candidate.classification = "sem_achado_no_escopo";
    candidate.review_item = null;
  }
}

evidence.refreshed_at = completedAt;
evidence.completed_at = completedAt;
evidence.batches = [...new Set(evidence.candidates.map((item) => item.batch))]
  .sort((a, b) => a - b)
  .map((batch) => {
    const candidates = evidence.candidates.filter(
      (item) => item.batch === batch,
    );
    return {
      batch,
      size: candidates.length,
      completed_at: completedAt,
      slugs: candidates.map((item) => item.slug),
      classifications: candidates.reduce((acc, item) => {
        acc[item.classification] = (acc[item.classification] ?? 0) + 1;
        return acc;
      }, {}),
    };
  });
evidence.existing_item_reviews = decisions.existing_item_reviews.map(
  (item) => ({
    ...item,
    status: "aguardando_aprovacao_thiago",
    publish_automatically: false,
  }),
);
evidence.summary = {
  total: evidence.candidates.length,
  pendentes: evidence.candidates.filter(
    (item) => item.classification === "pendente",
  ).length,
  concluidas_sem_achado: evidence.candidates.filter(
    (item) => item.classification === "sem_achado_no_escopo",
  ).length,
  pares_candidatos: decisions.pairs.length,
  itens_novos_revisao: decisions.pairs.length,
  revisoes_itens_existentes: decisions.existing_item_reviews.length,
  bloqueios: decisions.blocked.length,
  descartes: decisions.discards.length,
  descartes_por_tipo: decisions.discards.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1;
    return acc;
  }, {}),
  aprovacoes_dependentes_thiago:
    decisions.pairs.length + decisions.existing_item_reviews.length,
};

const tempPath = join(
  dirname(evidencePath),
  `.${evidencePath.split("/").at(-1)}.tmp`,
);
writeFileSync(tempPath, `${JSON.stringify(evidence, null, 2)}\n`);
renameSync(tempPath, evidencePath);
console.log(JSON.stringify(evidence.summary, null, 2));
