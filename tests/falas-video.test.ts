import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { CANAIS_AO_VIVO_APROVADOS, exportarTextoLegendaVtt, lerEvidenciaVideo } from "../scripts/lib/falas-evidencia-video"
import { CANAL_METAL_TV, FONTE_UFPR, PUBLISHER_METAL_TV, URL_METAL_TV, validarEstruturaVideoGravado } from "../scripts/lib/falas-video-gravado"
import type { FalaCandidato } from "../src/lib/falas-candidatos"

const url = "https://www.youtube.com/watch?v=rl_NCDHTsH4"
const channelId: keyof typeof CANAIS_AO_VIVO_APROVADOS = "UCn6Moj1CU0yJi-xZpsKDaZg"
const now = new Date("2026-09-11T12:00:00Z")

function metadata(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "rl_NCDHTsH4",
    webpage_url: url,
    channel_id: channelId,
    title: "AO VIVO | Jornal do Dia - 08/09/2026",
    description: "Episódio oficial da TV Ponta Negra.",
    was_live: true,
    live_status: "was_live",
    release_timestamp: 1788884722,
    upload_date: "20260908",
    ...overrides,
  })
}

test("aceita metadata real mínimo da transmissão da Arinalda em 08/09", () => {
  const raw = metadata()
  const result = lerEvidenciaVideo(raw, url, channelId, now)
  assert.equal(CANAIS_AO_VIVO_APROVADOS[channelId].publisher, "TV Ponta Negra")
  assert.equal(result.url, url)
  assert.equal(result.channel_id, channelId)
  assert.equal(result.broadcast_on, "2026-09-08")
  assert.equal(result.release_timestamp, 1788884722)
  assert.equal(result.raw_sha256, createHash("sha256").update(raw, "utf8").digest("hex"))
})

test("rejeita transmissão não concluída ou marcada como não live", () => {
  assert.throws(() => lerEvidenciaVideo(metadata({ was_live: false }), url, channelId, now), /transmissão ao vivo não confirmada/)
  assert.throws(() => lerEvidenciaVideo(metadata({ live_status: "not_live" }), url, channelId, now), /transmissão ao vivo não confirmada/)
})

test("não usa upload_date quando release_timestamp não existe", () => {
  assert.throws(() => lerEvidenciaVideo(metadata({ release_timestamp: undefined }), url, channelId, now), /release_timestamp inválido/)
  assert.throws(() => lerEvidenciaVideo(metadata({ release_timestamp: null }), url, channelId, now), /release_timestamp inválido/)
})

test("rejeita identidade de vídeo ou canal divergente", () => {
  assert.throws(() => lerEvidenciaVideo(metadata({ id: "short-id" }), url, channelId, now), /id inválido/)
  assert.throws(() => lerEvidenciaVideo(metadata({ webpage_url: "https://www.youtube.com/watch?v=outroVideo1" }), url, channelId, now), /URL divergente/)
  assert.throws(() => lerEvidenciaVideo(metadata({ channel_id: "UCoutroCanal" }), url, channelId, now), /canal divergente/)
})

test("exige release_timestamp inteiro, positivo e já ocorrido", () => {
  assert.throws(() => lerEvidenciaVideo(metadata({ release_timestamp: 1788884722.5 }), url, channelId, now), /release_timestamp inválido/)
  assert.throws(() => lerEvidenciaVideo(metadata({ release_timestamp: 0 }), url, channelId, now), /release_timestamp inválido/)
  assert.throws(() => lerEvidenciaVideo(metadata({ release_timestamp: now.getTime() / 1000 + 1 }), url, channelId, now), /release_timestamp futuro/)
})

test("título precisa conter a data local do broadcast", () => {
  assert.throws(() => lerEvidenciaVideo(metadata({ title: "AO VIVO | Jornal do Dia - 09/09/2026" }), url, channelId, now), /título não contém a data do broadcast/)
  assert.throws(() => lerEvidenciaVideo(metadata({ title: "AO VIVO | Jornal do Dia" }), url, channelId, now), /título não contém a data do broadcast/)
  assert.throws(() => lerEvidenciaVideo(metadata({ title: "AO VIVO | Jornal do Dia - 31/02/2026" }), url, channelId, now), /título não contém a data do broadcast/)
})

test("não executa conteúdo do metadata e rejeita JSON que não é objeto", () => {
  assert.throws(() => lerEvidenciaVideo("[1,2,3]", url, channelId, now), /JSON não é objeto/)
  assert.throws(() => lerEvidenciaVideo('{"id":"rl_NCDHTsH4"}\\nthrow new Error("executado")', url, channelId, now), /JSON inválido/)
})

test("converte VTT, remove tags e deduplica sobreposição das cues", () => {
  const vtt = `WEBVTT\nKind: captions\nLanguage: pt\n\n00:00:01.000 --> 00:00:03.000\nSe, de fato, o governo quisesse fazer, ele poderia sim,\n\n00:00:02.900 --> 00:00:05.000\nSe, de fato, o governo quisesse fazer, ele poderia sim, teria condições\n\n00:00:05.000 --> 00:00:07.000\nteria condições <c.colorE5E5E5>de fazer</c> moradia &gt; pública &amp; segurança\n`
  assert.equal(exportarTextoLegendaVtt(vtt), "Se, de fato, o governo quisesse fazer, ele poderia sim, teria condições de fazer moradia > pública & segurança")
})

test("substitui entidades Unicode fora do intervalo sem lançar erro", () => {
  const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA &#x110000; B &#55296; C`
  assert.equal(exportarTextoLegendaVtt(vtt), "A � B � C")
})

test("texto VTT alterado não coincide com a frase editorial comparada", () => {
  const altered = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nSe, de fato, o governo quisesse mudar, ele poderia sim\n`
  assert.notEqual(exportarTextoLegendaVtt(altered), "Se, de fato, o governo quisesse fazer, ele poderia sim")
})

test("aceita vídeo gravado do MetalTV com data explícita da realização", () => {
  const url = URL_METAL_TV
  const description = "Confira a fala do candidato ao Governo do Estado, Adriano Funileiro (PCO), sobre o tema Educação, no Ciclo de Entrevistas do SMC, realizado nesta segunda(31/08)."
  const quote: FalaCandidato = {
    id: "metal-tv-adriano",
    candidate_id: "30bca027-016e-4db1-a065-2081a62d71de",
    candidate_slug: "adriano-funileiro",
    candidate_name: "Adriano Funileiro",
    office: "Governador",
    uf: "PR",
    quote_text: "PCO, por exemplo, é pelo fim do vestibular.",
    context: "Educação",
    event_context: "Ciclo de Entrevistas do SMC",
    event_type: "sabatina",
    occurred_on: "2026-08-31",
    publisher: PUBLISHER_METAL_TV,
    article_url: url,
    article_title: "Ciclo de Entrevistas do SMC (Governo do Estado): Adriano Funileiro(PCO) - Tema: Educação",
    article_published_at: "2026-09-02T15:20:05.000Z",
    observed_at: "2026-09-12T00:00:00.000Z",
    source_sha256: "a".repeat(64),
    attribution: "explicit_name_same_paragraph",
    transcription: {
      kind: "automatic",
      media_url: url,
      start_seconds: 195,
      end_seconds: 215,
      media_published_at: "2026-09-02T15:20:05.000Z",
      engine: "fixture",
      transcript_sha256: "b".repeat(64),
      verification_sha256: "c".repeat(64),
      audio_sha256: "d".repeat(64),
      speaker_context: "Adriano Funileiro identificado no episódio",
      reviewed_context: true,
    },
    review_evidence: {
      identity_excerpt: description,
      date_excerpt: description,
      fetched_url: url,
      method: "codex_source_review",
      recorded_video: {
        url,
        channel_id: CANAL_METAL_TV,
        published_at: "2026-09-02T15:20:05.000Z",
        metadata_sha256: "e".repeat(64),
        frame_sha256: "f".repeat(64),
        frame_at_seconds: 203,
        description_excerpt: description,
        publisher_identity_url: FONTE_UFPR,
        date_basis: "explicit_recording_date",
        recorded_on: "2026-08-31",
        reviewed_context: true,
      },
      supporting_sources: [{
        url: FONTE_UFPR,
        sha256: "1".repeat(64),
        excerpts: ["Teixeira esteve presente nesta segunda-feira (31), de modo remoto, na sabatina mediada pelo sindicato dos metalúrgicos de Curitiba."],
      }],
    },
  }

  assert.doesNotThrow(() => validarEstruturaVideoGravado(quote))
  assert.throws(() => validarEstruturaVideoGravado({
    ...quote,
    occurred_on: "2026-09-02",
  }), /Vídeo gravado sem intervalo ou canal comprovado/)
  assert.throws(() => validarEstruturaVideoGravado({
    ...quote,
    review_evidence: {
      ...quote.review_evidence!,
      recorded_video: {
        ...quote.review_evidence!.recorded_video!,
        description_excerpt: description.replace("31/08", "30/08"),
      },
    },
  }), /Vídeo gravado sem intervalo ou canal comprovado/)
  assert.throws(() => validarEstruturaVideoGravado({
    ...quote,
    occurred_on: "2026-09-01",
    review_evidence: {
      ...quote.review_evidence!,
      date_excerpt: description.replace("31/08", "01/09"),
      recorded_video: {
        ...quote.review_evidence!.recorded_video!,
        description_excerpt: description.replace("31/08", "01/09"),
        date_basis: "explicit_recording_date",
        recorded_on: "2026-09-01",
      },
    },
  }), /Vídeo gravado sem intervalo ou canal comprovado/)
  assert.throws(() => validarEstruturaVideoGravado({
    ...quote,
    candidate_id: "candidate-other",
  }), /Vídeo gravado sem intervalo ou canal comprovado/)
})
