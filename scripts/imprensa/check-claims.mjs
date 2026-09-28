#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parse } from "csv-parse/sync";

const PRIVATE_HOST = /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*|\[?fe80:.*)$/i;

function assertPublicUrl(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ValidationError("URL deve usar HTTP ou HTTPS");
  if (url.username || url.password || PRIVATE_HOST.test(url.hostname)) throw new ValidationError("URL aponta para destino não público");
}

// Recusa nome que resolve para endereço privado (inclui IPv6 mapeado em IPv4).
async function assertPublicAddress(url) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addresses) {
    const plain = address.replace(/^::ffff:/i, "");
    if (PRIVATE_HOST.test(plain) || PRIVATE_HOST.test(`[${plain}]`)) throw new ValidationError("URL resolve para destino não público");
  }
}

// Segue redirecionamentos um a um, validando cada destino antes do GET.
async function fetchPublicUrl(start) {
  let current = start;
  for (let hop = 0; hop <= 5; hop += 1) {
    assertPublicUrl(current);
    await assertPublicAddress(current);
    const response = await fetch(current, { method: "GET", signal: AbortSignal.timeout(15_000), redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new ValidationError("redirecionamentos demais");
}


const requiredColumns = [
  "claim",
  "número",
  "url_fonte_primaria",
  "data_documento",
  "data_coleta",
  "recorte",
  "arquivo_de_uso",
  "generated_at",
];

function fail(message) {
  console.error(`CLAIMS_ERROR ${message}`);
  process.exitCode = 1;
}

class ValidationError extends Error {}

const csvPath = process.argv[2];
if (!csvPath || process.argv.length !== 3) {
  fail("uso: node scripts/imprensa/check-claims.mjs <csv>");
} else {
  try {
    const csv = await readFile(csvPath, "utf8");
    const rows = parse(csv, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: true,
    });

    if (rows.length === 0) throw new ValidationError("CSV sem registros");

    const headers = Object.keys(rows[0]);
    const missingHeaders = requiredColumns.filter((column) => !headers.includes(column));
    if (missingHeaders.length > 0) {
      throw new ValidationError(`colunas obrigatórias ausentes (${missingHeaders.length})`);
    }

    const checkedUrls = new Set();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;
      for (const column of requiredColumns) {
        if (typeof row[column] !== "string" || row[column].trim() === "") {
          throw new ValidationError(`campo obrigatório vazio na linha ${rowNumber}, coluna ${column}`);
        }
      }

      const generatedAt = Date.parse(row.generated_at);
      if (!Number.isFinite(generatedAt)) {
        throw new ValidationError(`generated_at inválido na linha ${rowNumber}`);
      }

      let sourceUrl;
      try {
        sourceUrl = new URL(row.url_fonte_primaria);
      } catch {
        throw new ValidationError(`URL inválida na linha ${rowNumber}`);
      }
      if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
        throw new ValidationError(`URL deve usar HTTP ou HTTPS na linha ${rowNumber}`);
      }
      if (checkedUrls.has(sourceUrl.href)) continue;

      let response;
      try {
        response = await fetchPublicUrl(sourceUrl);
      } catch (error) {
        if (error instanceof ValidationError) throw new ValidationError(`${error.message} na linha ${rowNumber}`);
        throw new ValidationError(`falha no GET da fonte na linha ${rowNumber}`);
      }
      if (response.status !== 200) {
        throw new ValidationError(`GET da fonte retornou HTTP ${response.status} na linha ${rowNumber}`);
      }
      // Evita manter ou imprimir qualquer parte do corpo da resposta.
      await response.body?.cancel();
      checkedUrls.add(sourceUrl.href);
    }

    console.log(`CLAIMS_OK ${rows.length}`);
  } catch (error) {
    const message = error instanceof ValidationError ? error.message : "falha ao ler ou processar CSV";
    fail(message);
  }
}
