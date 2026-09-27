import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCurrentOfficialCandidacies,
  sanitizeCandidateList,
  sanitizeCandidateDetail,
  BRAZIL_UFS,
  sanitizeVices,
  collectDirectCandidaciesMissingFromCdn,
  fetchJsonWithRetry,
  DIVULGACAND_BASE,
  ELECTION_ID_2026,
  type DivulgaCandReceipt,
} from "../scripts/lib/data-freshness/divulgacand-current";
import { classifyOfficialCandidacy, comparePublicProfileStatuses, reconcilePublicRoster } from "../src/lib/candidate-publication-integrity";
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
    undefined, async () => {}, // sem `now` explícito; backoff mockado para o teste não dormir de verdade.
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

// Regressão issue #340 (16/09/2026, run 35172127295): a auditoria em produção
// quebrou com "DivulgaCand vices duplicadas ou situação desconhecida para SQ
// 280002554479" (Leonardo Avalanche, PRTB). O payload real, buscado ao vivo em
// .../candidato/280002554479 no mesmo dia, tem UMA vice só (SILVIA,
// sq_CANDIDATO 280002554490) com `situacaoVice: 12` — "Pendente de
// julgamento" no código que a API AO VIVO usa para a vice, distinto do
// código 17 que consulta_cand_complementar usa para a mesma descrição.
test("admite vice com situacaoVice 12 (pendente de julgamento), payload real de Leonardo Avalanche/Silvia", async () => {
  const fixture = directFixture();
  fixture.titular.vices = [
    { sq_CANDIDATO: fixture.vice.id, nm_URNA: fixture.vice.nomeUrna, situacaoVice: 12, sg_PARTIDO: "DEMOCRATA" },
  ];
  const rows = await collectFixture(fixture);
  assert.deepEqual(rows.map((row) => row.sq_candidato), ["270002554375", "270002554376"]);
});

// A causa que a mensagem de erro também cobria ("vices duplicadas") continua
// bloqueada, mas só quando a duplicata é de vice ainda vigente. Uma vice
// substituída (situacaoVice 3) pode ficar no mesmo array que o registro
// vigente do mesmo SQ — TSE preserva histórico —, e isso não pode voltar a
// derrubar a auditoria: a linha substituída sai do cálculo de duplicidade e
// código desconhecido antes da checagem, não relaxa a checagem em si.
test("vice substituída (situacaoVice 3) duplicando o SQ da vice vigente não bloqueia", async () => {
  const fixture = directFixture();
  fixture.titular.vices = [
    { sq_CANDIDATO: fixture.vice.id, nm_URNA: fixture.vice.nomeUrna, situacaoVice: 3, sg_PARTIDO: "DEMOCRATA" },
    { sq_CANDIDATO: fixture.vice.id, nm_URNA: fixture.vice.nomeUrna, situacaoVice: 12, sg_PARTIDO: "DEMOCRATA" },
  ];
  const rows = await collectFixture(fixture);
  assert.deepEqual(rows.map((row) => row.sq_candidato), ["270002554375", "270002554376"]);
});

// Duas vices ATIVAS com o mesmo SQ (nenhuma delas substituída) continua sendo
// o defeito real que a checagem de duplicidade existe para pegar.
test("duas vices vigentes com o mesmo SQ (nenhuma substituída) continua recusando", async () => {
  const fixture = directFixture();
  fixture.titular.vices = [
    { sq_CANDIDATO: fixture.vice.id, nm_URNA: fixture.vice.nomeUrna, situacaoVice: 1, sg_PARTIDO: "DEMOCRATA" },
    { sq_CANDIDATO: fixture.vice.id, nm_URNA: fixture.vice.nomeUrna, situacaoVice: 12, sg_PARTIDO: "DEMOCRATA" },
  ];
  await assert.rejects(collectFixture(fixture), /DivulgaCand/);
});

// Código desconhecido de verdade (nem 1, nem 3, nem 12) continua recusando,
// mesmo isolado sem duplicata: alargar o vocabulário não pode virar "aceita
// qualquer coisa".
test("situacaoVice fora do vocabulário conhecido (nem 1, 3 ou 12) continua recusando", async () => {
  const fixture = directFixture();
  fixture.titular.vices = [
    { sq_CANDIDATO: fixture.vice.id, nm_URNA: fixture.vice.nomeUrna, situacaoVice: 7, sg_PARTIDO: "DEMOCRATA" },
  ];
  await assert.rejects(collectFixture(fixture), /DivulgaCand/);
});

test("falha HTTP preserva recibo, não retorna admissão parcial, e guarda excerto sanitizado do erro", async () => {
  const fixture = directFixture();
  const originalFetch = fixture.fakeFetch;
  fixture.fakeFetch = async (input) => String(input).endsWith("270002554376")
    ? new Response("Candidatura não localizada\n\n  espaço  extra", { status: 404 })
    : originalFetch(input);
  await assert.rejects(collectFixture(fixture), /HTTP 404/);
  assert.equal(fixture.receipts.length, 2);
  assert.equal(fixture.receipts[0].http_status, 200);
  assert.equal(fixture.receipts[0].error_excerpt, null);
  assert.equal(fixture.receipts[1].http_status, 404);
  assert.equal(fixture.receipts[1].error_excerpt, "Candidatura não localizada espaço extra");
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

test("detalhe atual prevalece sobre lista antiga e flag inapta impede admissão", () => {
  const fixture = directFixture();
  fixture.titular.descricaoSituacao = "Indeferido";
  fixture.titular.isCandidatoInapto = true;
  const current = sanitizeCandidateDetail(fixture.titular, fixture.current[0]);
  assert.equal(current.list_status, "Aguardando julgamento");
  assert.equal(current.status, "Indeferido");
  assert.equal(classifyOfficialCandidacy(current), "terminal");
  assert.deepEqual(current.vices.map((vice) => [vice.sq_candidato, vice.situacao_vice, vice.party]), [
    ["270002546369", 3, "DEMOCRATA"], ["270002554376", 1, "DEMOCRATA"],
  ]);
  assert.doesNotMatch(JSON.stringify(current), /PRIVATE_MARKER|cpf|emails/);
  const changes = comparePublicProfileStatuses([{ ...current, profile_slug: "teste" }], [{
    slug: "teste", office: "Governador", uf: "TO", situacao_candidatura: "aguardando julgamento",
  }]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].official_state, "terminal");
});

test("indeferido concorrendo com flags aptas permanece ativo; situação desconhecida não ganha admissão", () => {
  const fixture = directFixture();
  const current = sanitizeCandidateDetail({ ...fixture.titular, descricaoSituacao: "Indeferido", descricaoTotalizacao: "Concorrendo" }, fixture.current[0]);
  assert.equal(classifyOfficialCandidacy(current), "active");
  assert.equal(classifyOfficialCandidacy({ ...current, totalizacao: null }), "review_required");
  assert.equal(classifyOfficialCandidacy({ ...current, is_candidato_inapto: true }), "terminal");
  assert.equal(classifyOfficialCandidacy({ ...current, substituido: true }), "terminal");
});

test("compara julgamento publicado normalizado e detecta mudança mesmo entre situações ativas", () => {
  const row = { ...directFixture().current[0], profile_slug: "teste", status: "Indeferido em prazo recursal ou com recurso" };
  const published = { slug: "teste", office: "Governador" as const, uf: "TO", situacao_candidatura: "indeferido com recurso" };
  assert.equal(comparePublicProfileStatuses([row], [published]).length, 0);
  assert.equal(comparePublicProfileStatuses([{ ...row, status: "Deferido" }], [published]).length, 1);
});

test("Laudicério: inscrição terminal anterior não substitui julgamento da única inscrição ativa", () => {
  const active = { ...directFixture().current[0], sq_candidato: "110002554073", profile_slug: "laudicerio",
    uf: "MT", status: "Aguardando julgamento", is_candidato_inapto: false, substituido: false };
  const terminal = { ...active, sq_candidato: "110002553937", status: "Indeferido", is_candidato_inapto: true };
  const profile = { slug: "laudicerio", office: "Governador" as const, uf: "MT", situacao_candidatura: "aguardando julgamento" };
  assert.deepEqual(comparePublicProfileStatuses([terminal, active], [profile]), []);
  assert.equal(comparePublicProfileStatuses([terminal, { ...active, status: "Deferido" }], [profile])[0].sq_candidato, active.sq_candidato);
  assert.equal(comparePublicProfileStatuses([terminal], [profile]).length, 1);
  assert.equal(comparePublicProfileStatuses([terminal, { ...active, uf: "TO" }], [profile]).length, 1);
  const duplicate = { ...active, sq_candidato: "110002554074" };
  assert.equal(reconcilePublicRoster([terminal, active, duplicate], [profile]).status, "review_required");
  assert.equal(comparePublicProfileStatuses([terminal, active, duplicate], [profile]).length, 1);
  const unknown = { ...terminal, is_candidato_inapto: false, status: "Desconhecido" };
  assert.equal(comparePublicProfileStatuses([unknown, active], [profile]).length, 1);
});

test("coleta detalhes de todas 27 UFs e BR com concorrência limitada e recibos", async () => {
  let running = 0;
  let maximum = 0;
  const details: string[] = [];
  const scopes = [...BRAZIL_UFS, "BR"];
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input);
    const scope = scopes.find((uf) => url.includes(`/2026/${uf}/`))!;
    const id = String(scopes.indexOf(scope) + 1);
    const common = { id, nomeUrna: "TESTE", descricaoSituacao: "Deferido", partido: { sigla: "TESTE" } };
    if (url.includes("/listar/")) return new Response(JSON.stringify([common]));
    running++;
    maximum = Math.max(maximum, running);
    details.push(scope);
    await new Promise((resolve) => setTimeout(resolve, 1));
    running--;
    return new Response(JSON.stringify({ ...common, ufCandidatura: scope,
      eleicao: { id: ELECTION_ID_2026, ano: 2026 }, cargo: { codigo: scope === "BR" ? 1 : 3 },
      isCandidatoInapto: scope === "BR", st_SUBSTITUIDO: false, cpf: "PRIVATE_MARKER",
    }));
  };
  const result = await collectCurrentOfficialCandidacies(fakeFetch);
  assert.equal(result.records.length, 28);
  assert.deepEqual(details.sort(), scopes.sort());
  assert.equal(maximum, 4);
  assert.equal(result.receipts.length, 56);
  assert.ok(result.receipts.every((receipt) => receipt.http_status === 200 && /^[a-f0-9]{64}$/.test(receipt.sha256 ?? "")));
  assert.equal(classifyOfficialCandidacy(result.records.at(-1)!), "terminal");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_MARKER|cpf/);
});

test("detalhe rejeita identidade divergente e flags ausentes sem retornar PII", () => {
  const fixture = directFixture();
  for (const patch of [{ id: 999 }, { nomeUrna: "OUTRO" }, { partido: { sigla: "OUTRO" } },
    { ufCandidatura: "SP" }, { eleicao: { id: 2022, ano: 2022 } }, { cargo: { codigo: 4 } },
    { isCandidatoInapto: undefined }, { st_SUBSTITUIDO: undefined }]) {
    assert.throws(() => sanitizeCandidateDetail({ ...fixture.titular, ...patch }, fixture.current[0]), /identidade ou flags/);
  }
});

// Regressão run 36024469024 (24/09/2026): um detalhe de candidatura (JHC/AL)
// respondeu HTTP 400 transitório — a mesma URL tinha respondido 200 oito
// minutos antes e no dia anterior. `fetchJsonWithRetry` só retenta 400 nos
// endpoints de candidatura (lista e detalhe); em qualquer outra rota 400
// continua definitivo. `noDelay` evita esperar o backoff real nos testes.
const CANDIDACY_DETAIL_URL = `${DIVULGACAND_BASE}/buscar/2026/AL/${ELECTION_ID_2026}/candidato/20002553350`;
const noDelay = async () => {};

test("400 transitório num endpoint de candidatura é retentado e sucede com 2 tentativas registradas", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls === 1) return new Response("Bad Request", { status: 400 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const receipts: DivulgaCandReceipt[] = [];
  const result = await fetchJsonWithRetry(CANDIDACY_DETAIL_URL, fakeFetch, 3, receipts, noDelay);
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].http_status, 400);
  assert.equal(receipts[1].http_status, 200);
});

test("400 persistente num endpoint de candidatura esgota as 3 tentativas com excerto sanitizado do corpo no erro", async () => {
  const fakeFetch = async () => new Response("Akamai bloqueou   a requisição\n", { status: 400 });
  const receipts: DivulgaCandReceipt[] = [];
  await assert.rejects(
    fetchJsonWithRetry(CANDIDACY_DETAIL_URL, fakeFetch, 3, receipts, noDelay),
    (error: Error) => {
      assert.match(error.message, /HTTP 400/);
      assert.match(error.message, /Akamai bloqueou a requisição/);
      return true;
    },
  );
  assert.equal(receipts.length, 3);
  assert.ok(receipts.every((receipt) =>
    receipt.http_status === 400 && receipt.error_excerpt === "Akamai bloqueou a requisição"));
});

test("400 fora de endpoint de candidatura não é retentado", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return new Response("Bad Request", { status: 400 }); };
  const receipts: DivulgaCandReceipt[] = [];
  const nonCandidacyUrl = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1/outra-rota/2026";
  await assert.rejects(fetchJsonWithRetry(nonCandidacyUrl, fakeFetch, 3, receipts, noDelay), /HTTP 400/);
  assert.equal(calls, 1);
  assert.equal(receipts.length, 1);
});

test("403 e 5xx continuam sendo retentados como antes", async () => {
  for (const status of [403, 500, 502, 503, 504]) {
    let calls = 0;
    const fakeFetch = async () => {
      calls++;
      if (calls < 3) return new Response("erro temporário", { status });
      return new Response(JSON.stringify({ ok: status }), { status: 200 });
    };
    const receipts: DivulgaCandReceipt[] = [];
    const result = await fetchJsonWithRetry(CANDIDACY_DETAIL_URL, fakeFetch, 3, receipts, noDelay);
    assert.deepEqual(result, { ok: status });
    assert.equal(calls, 3);
    assert.equal(receipts.length, 3);
  }
});

test("duas SQs falhando na mesma coleta produzem um único erro citando as duas, com status registrado em todos os recibos", async () => {
  const scopes = [...BRAZIL_UFS, "BR"];
  const failingScopes = new Set(["AL", "BA"]);
  const idFor = (scope: string) => String(scopes.indexOf(scope) + 1);
  const receipts: DivulgaCandReceipt[] = [];
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input);
    const scope = scopes.find((uf) => url.includes(`/2026/${uf}/`))!;
    const common = { id: idFor(scope), nomeUrna: "TESTE", descricaoSituacao: "Deferido", partido: { sigla: "TESTE" } };
    if (url.includes("/listar/")) return new Response(JSON.stringify([common]));
    if (failingScopes.has(scope)) return new Response("indisponível", { status: 404 });
    return new Response(JSON.stringify({ ...common, ufCandidatura: scope,
      eleicao: { id: ELECTION_ID_2026, ano: 2026 }, cargo: { codigo: scope === "BR" ? 1 : 3 },
      isCandidatoInapto: false, st_SUBSTITUIDO: false,
    }));
  };
  await assert.rejects(collectCurrentOfficialCandidacies(fakeFetch, receipts), (error: Error) => {
    assert.match(error.message, /DivulgaCand detalhe falhou para 2 candidatura/);
    assert.ok(error.message.includes(`SQ ${idFor("AL")}:`));
    assert.ok(error.message.includes(`SQ ${idFor("BA")}:`));
    assert.match(error.message, /HTTP 404/);
    return true;
  });
  assert.equal(receipts.length, 56);
  assert.ok(receipts.every((receipt) => receipt.http_status !== null));
  assert.equal(receipts.filter((receipt) => receipt.http_status === 404).length, 2);
});
