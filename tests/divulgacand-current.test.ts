import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCurrentOfficialCandidacies,
  sanitizeCandidateList,
  sanitizeVices,
  collectDirectCandidaciesMissingFromCdn,
  DIVULGACAND_BASE,
  ELECTION_ID_2026,
  type DivulgaCandReceipt,
} from "../scripts/lib/data-freshness/divulgacand-current";
import { compareCandidacies } from "../scripts/lib/data-freshness/candidaturas";
import type { CandidacyRecord } from "../scripts/lib/data-freshness/types";

test("sanitiza a lista sem propagar CPF, título, email ou processo", () => {
  const rows = sanitizeCandidateList(
    [
      {
        id: 140002554108,
        nomeUrna: "WELL MACEDO",
        descricaoSituacao: "Aguardando julgamento",
        dataUltimaAtualizacao: "2026-08-20 18:31",
        partido: { sigla: "PSTU" },
        cpf: "nao-deve-sair",
        tituloEleitor: "nao-deve-sair",
        emails: ["nao-deve-sair"],
        numeroProcesso: "nao-deve-sair",
      },
    ],
    "Governador",
    "PA",
  );

  assert.deepEqual(rows, [
    {
      sq_candidato: "140002554108",
      profile_slug: null,
      office: "Governador",
      uf: "PA",
      name: "WELL MACEDO",
      status: "Aguardando julgamento",
      party: "PSTU",
      checked_at: "2026-08-20 18:31",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /cpf|titulo|email|processo/i);
});

test("normaliza vices e preserva o código que decide vigência", () => {
  assert.deepEqual(
    sanitizeVices({
      vices: [
        { sq_CANDIDATO: 140002538632, nm_URNA: "WELL MACEDO", situacaoVice: 3 },
        { sq_CANDIDATO: 140002554109, nm_URNA: "SEU ALEX", situacaoVice: 1 },
      ],
    }),
    [
      { sq_candidato: "140002538632", name: "WELL MACEDO", situacao_vice: 3 },
      { sq_candidato: "140002554109", name: "SEU ALEX", situacao_vice: 1 },
    ],
  );
  assert.throws(
    () => sanitizeVices({ vices: [{ sq_CANDIDATO: 1, nm_URNA: "X" }] }),
    /situação da vice inválida/,
  );
  assert.throws(
    () =>
      sanitizeVices({
        vices: [{ sq_CANDIDATO: 1, nm_URNA: "X", situacaoVice: "x" }],
      }),
    /situação da vice inválida/,
  );
});

test("coleta falha fechada se qualquer UF vier vazia", async () => {
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input);
    const empty = url.includes("/TO/");
    return new Response(
      JSON.stringify(
        empty
          ? []
          : [
              {
                id: url.includes("/BR/") ? "280002500001" : `sq-${url}`,
                nomeUrna: "CANDIDATO",
                descricaoSituacao: "Deferido",
                partido: { sigla: "AAA" },
              },
            ],
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  await assert.rejects(
    collectCurrentOfficialCandidacies(fakeFetch),
    /zero candidatos a Governador em TO/,
  );
});

function directFixture() {
  const current = sanitizeCandidateList([{
    id: 270002554375, nomeUrna: "SIQUEIRA CAMPOS JR",
    descricaoSituacao: "Aguardando julgamento", partido: { sigla: "DEMOCRATA" },
  }], "Governador", "TO");
  const common = {
    isCandidatoInapto: false as boolean | undefined,
    st_SUBSTITUIDO: false as boolean | undefined,
    ufCandidatura: "TO", eleicao: { id: Number(ELECTION_ID_2026), ano: 2026 },
    descricaoSituacao: "Aguardando julgamento", partido: { sigla: "DEMOCRATA" },
    cpf: "PRIVATE_MARKER", emails: ["PRIVATE_MARKER"],
  };
  const titular = {
    ...common, id: 270002554375, nomeUrna: "SIQUEIRA CAMPOS JR", cargo: { codigo: 3 },
    vices: [
      { sq_CANDIDATO: 270002546369, nm_URNA: "JAIR MEDEIROS", situacaoVice: 3, sg_PARTIDO: "DEMOCRATA" },
      { sq_CANDIDATO: 270002554376, nm_URNA: "CAPITÃO OSMAR", situacaoVice: 1, sg_PARTIDO: "DEMOCRATA" },
    ],
  };
  const vice = { ...common, id: 270002554376, nomeUrna: "CAPITÃO OSMAR", cargo: { codigo: 4 } };
  const listReceipts: DivulgaCandReceipt[] = [{
    url: `${DIVULGACAND_BASE}/listar/2026/TO/${ELECTION_ID_2026}/3/candidatos`,
    checked_at: new Date().toISOString(), http_status: 200, sha256: "a".repeat(64),
  }];
  const receipts: DivulgaCandReceipt[] = [];
  const urls: string[] = [];
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    return new Response(JSON.stringify(url.endsWith(String(titular.id)) ? titular : vice), { status: 200 });
  };
  return { current, titular, vice, listReceipts, receipts, urls, fakeFetch };
}

async function collectFixture(fixture: ReturnType<typeof directFixture>, cdn: CandidacyRecord[] = []) {
  return collectDirectCandidaciesMissingFromCdn(
    cdn, fixture.current, fixture.listReceipts, fixture.receipts, fixture.fakeFetch,
  );
}

test("admite titular e vice ausentes CDN somente com prova direta; recibos não expõem dados privados", async () => {
  const fixture = directFixture();
  const rows = await collectFixture(fixture);
  assert.deepEqual(rows.map((row) => row.sq_candidato), ["270002554375", "270002554376"]);
  assert.ok(rows.every((row) => row.sq_coligacao === "" && row.situacao_codigo === null));
  assert.equal(fixture.urls.length, 2);
  assert.ok(fixture.receipts.every((receipt) => receipt.http_status === 200 && /^[a-f0-9]{64}$/.test(receipt.sha256 ?? "")));
  assert.doesNotMatch(JSON.stringify({ rows, receipts: fixture.receipts }), /PRIVATE_MARKER|cpf|emails/);
  const published = rows.map((row) => ({ ...row, source_origin: undefined, perfil_slug: "siqueira-campos-jr" }));
  assert.equal(compareCandidacies(rows, published, new Date().toISOString()).status, "ok");
  published[0].situacao_descricao = "Deferido";
  assert.equal(compareCandidacies(rows, published, new Date().toISOString()).counts.status_change, 1);
});

test("SQ presente CDN não aciona fallback nem substitui comparação de status e identidade", async () => {
  const fixture = directFixture();
  const existing = (await collectFixture(fixture))[0];
  fixture.urls.length = 0;
  existing.situacao_codigo = "-3";
  delete existing.source_origin;
  assert.deepEqual(await collectFixture(fixture, [existing]), []);
  assert.equal(fixture.urls.length, 0);
  const published = { ...existing, nome_urna: "OUTRO NOME", situacao_codigo: "2", perfil_slug: "siqueira-campos-jr" };
  const result = compareCandidacies([existing], [published], new Date().toISOString());
  assert.equal(result.counts.identity_mismatch, 1);
  assert.equal(result.counts.status_change, 1);
});

for (const status of ["Indeferido", "Renúncia", "Situação desconhecida"]) {
  test(`lista com ${status} não admite; remoção continua bloqueando`, async () => {
    const fixture = directFixture();
    const published = await collectFixture(fixture);
    fixture.current[0].status = status;
    fixture.urls.length = 0;
    const rows = await collectFixture(fixture);
    assert.deepEqual(rows, []);
    assert.equal(fixture.urls.length, 0);
    assert.equal(compareCandidacies(rows, published, new Date().toISOString()).counts.removal, 2);
  });
}

const invalidDetails: Array<[string, (fixture: ReturnType<typeof directFixture>) => void]> = [
  ["nome", (f) => { f.titular.nomeUrna = "OUTRO"; }],
  ["partido", (f) => { f.titular.partido = { sigla: "OUTRO" }; }],
  ["UF", (f) => { f.titular.ufCandidatura = "SP"; }],
  ["cargo", (f) => { f.titular.cargo.codigo = 4; }],
  ["eleição", (f) => { f.titular.eleicao.id = 2022; }],
  ["SQ", (f) => { f.titular.id = 1; }],
  ["situação terminal", (f) => { f.titular.descricaoSituacao = "Indeferido"; }],
  ["situação divergente", (f) => { f.titular.descricaoSituacao = "Deferido"; }],
  ["titular inapto", (f) => { f.titular.isCandidatoInapto = true; }],
  ["titular substituído", (f) => { f.titular.st_SUBSTITUIDO = true; }],
  ["titular sem flag inapto", (f) => { f.titular.isCandidatoInapto = undefined; }],
  ["titular sem flag substituído", (f) => { f.titular.st_SUBSTITUIDO = undefined; }],
  ["vice inapta", (f) => { f.vice.isCandidatoInapto = true; }],
  ["vice substituída", (f) => { f.vice.st_SUBSTITUIDO = true; }],
  ["vice sem flag inapto", (f) => { f.vice.isCandidatoInapto = undefined; }],
  ["vice sem flag substituído", (f) => { f.vice.st_SUBSTITUIDO = undefined; }],
  ["vice terminal", (f) => { f.vice.descricaoSituacao = "Indeferido"; }],
  ["vice desconhecida", (f) => { f.vice.descricaoSituacao = "Desconhecida"; }],
  ["vice identidade", (f) => { f.vice.nomeUrna = "OUTRA VICE"; }],
  ["vice vigência desconhecida", (f) => { f.titular.vices[1].situacaoVice = 2; }],
  ["vice duplicada", (f) => { f.titular.vices.push({ ...f.titular.vices[1] }); }],
  ["duas vices vigentes", (f) => { f.titular.vices[0].situacaoVice = 1; }],
  ["nenhuma vice vigente", (f) => { f.titular.vices[1].situacaoVice = 3; }],
  ["lista duplicada", (f) => { f.current.push({ ...f.current[0] }); }],
  ["lista sem recibo", (f) => { f.listReceipts.length = 0; }],
  ["lista obsoleta", (f) => { f.listReceipts[0].checked_at = "2020-01-01T00:00:00Z"; }],
  ["lista HTTP falho", (f) => { f.listReceipts[0].http_status = 403; }],
];
for (const [label, mutate] of invalidDetails) {
  test(`recusa fallback com ${label}`, async () => {
    const fixture = directFixture();
    mutate(fixture);
    await assert.rejects(collectFixture(fixture), /DivulgaCand/);
  });
}

test("falha HTTP preserva recibo e não retorna admissão parcial", async () => {
  const fixture = directFixture();
  const originalFetch = fixture.fakeFetch;
  fixture.fakeFetch = async (input) => String(input).endsWith("270002554376")
    ? new Response("PRIVATE_MARKER", { status: 404 })
    : originalFetch(input);
  await assert.rejects(collectFixture(fixture), /HTTP 404/);
  assert.equal(fixture.receipts.length, 2);
  assert.equal(fixture.receipts[0].http_status, 200);
  assert.equal(fixture.receipts[1].http_status, 404);
  assert.doesNotMatch(JSON.stringify(fixture.receipts), /PRIVATE_MARKER/);
});

test("erro de parse não vaza o corpo privado para a mensagem de auditoria", async () => {
  const fixture = directFixture();
  fixture.fakeFetch = async () => new Response("PRIVATE_MARKER", { status: 200 });
  await assert.rejects(collectFixture(fixture), (error: Error) => {
    assert.match(error.message, /resposta inválida/);
    assert.doesNotMatch(error.message, /PRIVATE_MARKER/);
    return true;
  });
  assert.equal(fixture.receipts.length, 3);
});

test("slots sem coligação isolam SQs e preservam remoção e inclusão", async () => {
  const rows = await collectFixture(directFixture());
  const before = { ...rows[0], sq_candidato: "999", perfil_slug: "outra-ficha" };
  const result = compareCandidacies(rows, [before], new Date().toISOString());
  assert.equal(result.counts.replacement, 0);
  assert.equal(result.counts.removal, 1);
  assert.equal(result.counts.inclusion, 2);
  assert.equal(result.status, "review_required");
});

test("vice presente CDN continua intacta, mas conflito com detalhe impede fallback", async () => {
  const fixture = directFixture();
  const vice = (await collectFixture(fixture))[1];
  delete vice.source_origin;
  vice.situacao_codigo = "-3";
  const rows = await collectFixture(fixture, [vice]);
  assert.equal(rows.length, 1);
  assert.equal(vice.situacao_codigo, "-3");
  vice.nome_urna = "OUTRA VICE";
  await assert.rejects(collectFixture(fixture, [vice]), /vice diverge do CDN/);
});

test("vice compartilhada entre titulares é recusada mesmo quando já está no CDN", async () => {
  const fixture = directFixture();
  const vice = (await collectFixture(fixture))[1];
  fixture.current.push({ ...fixture.current[0], sq_candidato: "270002554377" });
  const originalFetch = fixture.fakeFetch;
  fixture.fakeFetch = async (input) => String(input).endsWith("270002554377")
    ? new Response(JSON.stringify({ ...fixture.titular, id: 270002554377 }))
    : originalFetch(input);
  await assert.rejects(collectFixture(fixture, [vice]), /vice compartilha SQ/);
});

test("CDN alcança a candidatura direta sem perder mudança de situação com código publicado nulo", async () => {
  const direct = (await collectFixture(directFixture()))[0];
  const published = { ...direct, source_origin: undefined, perfil_slug: "siqueira-campos-jr" };
  const cdn = { ...direct, source_origin: undefined, situacao_codigo: "-3", sq_coligacao: "coligacao-oficial" };
  assert.equal(compareCandidacies([cdn], [published], new Date().toISOString()).status, "ok");
  cdn.situacao_codigo = "2";
  cdn.situacao_descricao = "Deferido";
  assert.equal(compareCandidacies([cdn], [published], new Date().toISOString()).counts.status_change, 1);
});
