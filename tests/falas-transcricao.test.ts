import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import type { FalaCandidato } from "../src/lib/falas-candidatos"
import { sha256, type CandidatoFalas } from "../scripts/lib/falas-monitoramento"
import { medirAudioPcm, verificarTranscricao, type PacoteTranscricao } from "../scripts/lib/falas-transcricao"
import { CANAL_THE_PAPO, FONTE_THE_PAPO, intervaloSemanaPublicacao, lerPlayerYoutube } from "../scripts/lib/falas-video-gravado"

function wav(silent = false) {
  const b = Buffer.alloc(32044)
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write("data", 36); b.writeUInt32LE(32000, 40)
  for (let n = 0; n < 16000; n++) b.writeInt16LE(silent ? 0 : Math.round(8000 * Math.sin(n / 10)), 44 + n * 2)
  return b
}
function fixture() {
  const candidate: CandidatoFalas = { id: "fixture", slug: "pessoa-teste", nome_urna: "Pessoa Teste", nome_completo: "Pessoa Teste", estado: "PR", cargo_disputado: "Governador" }
  const articleUrl = "https://bandnewsfmcuritiba.com/fixture/"
  const mediaUrl = "https://example.test/audio.mp3"
  const identity = "Entrevista com Pessoa Teste, candidata ao governo."
  const date = "Entrevista realizada em 2 de setembro de 2026."
  const text = "Este texto pertence apenas a uma pessoa fictícia."
  const article = `<link rel="canonical" href="${articleUrl}"><meta property="article:published_time" content="2026-09-03T13:00:00Z"><p>${identity}</p><p>${date}</p><audio src="${mediaUrl}"></audio>`
  const audio = wav()
  const quote: FalaCandidato = {
    id: sha256("fixture:2026-09-02:este texto pertence apenas a uma pessoa ficticia"),
    candidate_id: candidate.id, candidate_slug: candidate.slug, candidate_name: candidate.nome_urna,
    office: "Governador", uf: "PR", quote_text: text, context: text, event_context: identity, event_type: "entrevista", occurred_on: "2026-09-02",
    publisher: "BandNews FM Curitiba", article_url: articleUrl, article_title: identity,
    article_published_at: "2026-09-03T13:00:00Z", observed_at: "2026-09-11T22:00:00Z", source_sha256: sha256(article), attribution: "source_context_review",
    review_evidence: { identity_excerpt: identity, date_excerpt: date, fetched_url: articleUrl, method: "codex_source_review" },
    transcription: { kind: "automatic", media_url: mediaUrl, start_seconds: 0, end_seconds: 1,
      media_published_at: "2026-09-03T13:00:00Z", engine: "synthetic fixture, not speech", transcript_sha256: sha256(text), verification_sha256: sha256(text),
      audio_sha256: createHash("sha256").update(audio).digest("hex"), speaker_context: "Identidade fictícia declarada pelo texto editorial de teste.", reviewed_context: true },
  }
  const evidence: PacoteTranscricao = { article, audio, transcript: text, verification: text }
  return { candidate, quote, evidence }
}
test("aceita pacote íntegro com mídia vinculada, contexto e data da entrevista", () => {
  const f = fixture(); verificarTranscricao(f.quote, f.candidate, f.evidence)
  assert.equal(medirAudioPcm(f.evidence.audio).seconds, 1)
})
test("rejeita alucinação de ASR sobre silêncio mesmo com hashes e textos concordantes", () => {
  const f = fixture(); f.evidence.audio = wav(true)
  f.quote.transcription!.audio_sha256 = createHash("sha256").update(f.evidence.audio).digest("hex")
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /silencioso/)
})
test("rejeita textos divergentes mesmo com hashes recalculados", () => {
  const f = fixture(); f.evidence.verification = "Outra resposta completamente diferente."
  f.quote.transcription!.verification_sha256 = sha256(f.evidence.verification)
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /duas transcrições/)
})
test("rejeita mídia não vinculada, arquivo alterado e candidato divergente", () => {
  const f = fixture(); f.quote.transcription!.media_url = "https://example.test/outro.mp3"
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /não vinculado/)
  const g = fixture(); g.evidence.audio[100] ^= 1
  assert.throws(() => verificarTranscricao(g.quote, g.candidate, g.evidence), /Integridade/)
  const h = fixture(); h.candidate.id = "outra-pessoa"
  assert.throws(() => verificarTranscricao(h.quote, h.candidate, h.evidence), /Identidade/)
})
test("agenda não comprova participação e não permite registro anterior à campanha", () => {
  const f = fixture(); f.quote.review_evidence!.date_excerpt = "Entrevista será realizada em 2 de setembro de 2026."
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /Agenda/)
  const g = fixture(); g.quote.occurred_on = "2026-08-10"
  assert.throws(() => verificarTranscricao(g.quote, g.candidate, g.evidence), /Data efetiva/)
})
test("rejeita WAV truncado ou com duração diferente do trecho", () => {
  assert.throws(() => medirAudioPcm(wav().subarray(0, 200)), /truncado/)
  const f = fixture(); f.quote.transcription!.end_seconds = 20
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /duração/)
})

function liveFixture(channelOnly = false) {
  const f = fixture()
  const channel = "UCic6Oio9KDhXYeyjl0XPetA"
  const id = "abcdefghijk"
  const url = `https://www.youtube.com/watch?v=${id}`
  const articleUrl = "https://www.monteroraimafm.com.br/noticia/fixture"
  const channelUrl = `https://www.youtube.com/channel/${channel}`
  const identity = "Entrevista com Pessoa Teste em 2 de setembro de 2026."
  f.evidence.article = `<link rel="canonical" href="${articleUrl}"><time pubdate>03/09/2026 10:28</time><p>${identity}</p><a href="${channelOnly ? channelUrl : url}">Vídeo</a>`
  f.evidence.metadata = JSON.stringify({ id, webpage_url: url, title: "Entrevista com Pessoa Teste", channel_id: channel, channel_url: channelUrl,
    was_live: true, live_status: "was_live", duration: 10, release_timestamp: Date.parse("2026-09-02T13:00:00Z") / 1000, upload_date: "20260905" })
  f.evidence.frame = Buffer.from("synthetic frame fixture")
  Object.assign(f.quote, { publisher: "Rádio Monte Roraima FM", article_url: articleUrl, article_published_at: "2026-09-03", source_sha256: sha256(f.evidence.article) })
  Object.assign(f.quote.transcription!, { media_url: url, media_published_at: "2026-09-02T13:00:00Z" })
  f.quote.review_evidence = { method: "codex_source_review", identity_excerpt: identity, date_excerpt: identity, fetched_url: articleUrl,
    live_video: { url, channel_id: channel, broadcast_on: "2026-09-02", release_timestamp: Date.parse("2026-09-02T13:00:00Z") / 1000,
      metadata_sha256: sha256(f.evidence.metadata), captions_sha256: sha256(f.evidence.transcript), frame_sha256: createHash("sha256").update(f.evidence.frame).digest("hex"),
      frame_at_seconds: 0.5, article_event_excerpt: identity, quote_excerpt: f.quote.quote_text, reviewed_live_on_air: true } }
  return f
}

function recordedFixture() {
  const f = fixture()
  const id = "abcdefghijk", url = `https://www.youtube.com/watch?v=${id}`
  const publication = "2026-09-01T23:23:15Z"
  const identity = "Nesta semana, o programa recebeu Pessoa Teste, candidata ao governo."
  const title = "Entrevista com Pessoa Teste"
  const player = { videoDetails: { videoId: id, channelId: CANAL_THE_PAPO, title, shortDescription: identity, lengthSeconds: "10", isLiveContent: false },
    microformat: { playerMicroformatRenderer: { publishDate: publication, uploadDate: publication } } }
  f.evidence.article = `<link rel="canonical" href="${url}"><script>var ytInitialPlayerResponse = ${JSON.stringify(player)}; throw new Error("never execute");</script>`
  f.evidence.metadata = JSON.stringify({ id, webpage_url: url, channel_id: CANAL_THE_PAPO, title, description: identity, duration: 10, upload_date: "20260901", was_live: false, live_status: "not_live" })
  f.evidence.frame = Buffer.from("synthetic recorded frame")
  const attribution = "O programa The Papo, do jornalista André Silva."
  const support = `<link rel="canonical" href="${FONTE_THE_PAPO}"><p>${attribution}</p>`
  f.evidence.supporting = [{ url: FONTE_THE_PAPO, raw: support }]
  Object.assign(f.quote, { occurred_on: null, occurred_between: { from: "2026-08-30", to: "2026-09-01" },
    id: sha256("fixture:2026-08-30/2026-09-01:este texto pertence apenas a uma pessoa ficticia"),
    publisher: "The Papo com André Silva", article_url: url, article_title: title, article_published_at: publication, source_sha256: sha256(f.evidence.article) })
  Object.assign(f.quote.transcription!, { media_url: url, media_published_at: publication })
  f.quote.review_evidence = { identity_excerpt: identity, date_excerpt: identity, fetched_url: url, method: "codex_source_review",
    supporting_sources: [{ url: FONTE_THE_PAPO, sha256: sha256(support), excerpts: [attribution] }],
    recorded_video: { url, channel_id: CANAL_THE_PAPO, published_at: publication, metadata_sha256: sha256(f.evidence.metadata),
      frame_sha256: createHash("sha256").update(f.evidence.frame).digest("hex"), frame_at_seconds: 0.5, description_excerpt: identity,
      publisher_identity_url: FONTE_THE_PAPO, date_basis: "publication_week_description", reviewed_context: true } }
  return f
}
test("gravação admite apenas o intervalo conservador da semana explicitamente declarada", () => {
  const f = recordedFixture(); verificarTranscricao(f.quote, f.candidate, f.evidence)
  assert.deepEqual(intervaloSemanaPublicacao("2026-09-01T23:23:15Z"), { from: "2026-08-30", to: "2026-09-01" })
  assert.deepEqual(intervaloSemanaPublicacao("2026-09-06T13:00:00Z"), { from: "2026-09-06", to: "2026-09-06" })
  f.quote.occurred_between!.from = "2026-08-31"
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /intervalo/)
})
test("upload sozinho, dia exato, agenda e outro canal não comprovam a gravação", () => {
  for (const mutate of [
    (f: ReturnType<typeof recordedFixture>) => { f.quote.occurred_on = "2026-09-01" },
    (f: ReturnType<typeof recordedFixture>) => { f.quote.review_evidence!.recorded_video!.description_excerpt = "Programa recebeu Pessoa Teste." },
    (f: ReturnType<typeof recordedFixture>) => { f.quote.review_evidence!.recorded_video!.channel_id = "outro-canal" },
    (f: ReturnType<typeof recordedFixture>) => { f.quote.review_evidence!.recorded_video!.description_excerpt = "Nesta semana receberá Pessoa Teste." },
  ]) {
    const f = recordedFixture(); mutate(f)
    assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /intervalo/)
  }
})
test("gravação exige HTML, metadados, quadro e prova do veículo coerentes", () => {
  const f = recordedFixture(); const m = JSON.parse(f.evidence.metadata!); m.was_live = true
  f.evidence.metadata = JSON.stringify(m); f.quote.review_evidence!.recorded_video!.metadata_sha256 = sha256(f.evidence.metadata!)
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /metadados/)
  const g = recordedFixture(); g.evidence.supporting = []
  assert.throws(() => verificarTranscricao(g.quote, g.candidate, g.evidence), /jornalística/)
  const h = recordedFixture(); h.evidence.frame = Buffer.from("different frame")
  assert.throws(() => verificarTranscricao(h.quote, h.candidate, h.evidence), /Integridade/)
  assert.equal(lerPlayerYoutube('var ytInitialPlayerResponse = {"videoDetails":{"title":"a } brace"}};throw 1').videoDetails!.title, "a } brace")
  assert.throws(() => lerPlayerYoutube('var ytInitialPlayerResponse = {"unfinished":'), /truncados/)
})
test("transmissão usa início real e aceita publicação com precisão de dia", () => {
  const f = liveFixture(); verificarTranscricao(f.quote, f.candidate, f.evidence)
  f.quote.occurred_on = "2026-09-05"
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /Data ou episódio/)
})
test("link do canal exige episódio que nomeie o candidato e coincida com o dia anunciado", () => {
  const f = liveFixture(true); verificarTranscricao(f.quote, f.candidate, f.evidence)
  const m = JSON.parse(f.evidence.metadata!); m.title = "Entrevista com outra pessoa"
  f.evidence.metadata = JSON.stringify(m); f.quote.review_evidence!.live_video!.metadata_sha256 = sha256(f.evidence.metadata!)
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /não vinculada/)
})
test("rejeita quadro fora do trecho e canal adulterado", () => {
  const f = liveFixture(); f.quote.review_evidence!.live_video!.frame_at_seconds = 5
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /não vinculada/)
  const g = liveFixture(); const m = JSON.parse(g.evidence.metadata!); m.channel_id = "outro"
  g.evidence.metadata = JSON.stringify(m); g.quote.review_evidence!.live_video!.metadata_sha256 = sha256(g.evidence.metadata!)
  assert.throws(() => verificarTranscricao(g.quote, g.candidate, g.evidence), /não vinculada/)
})
