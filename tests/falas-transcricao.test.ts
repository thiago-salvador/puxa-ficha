import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import type { FalaCandidato } from "../src/lib/falas-candidatos"
import { sha256, type CandidatoFalas } from "../scripts/lib/falas-monitoramento"
import { medirAudioPcm, verificarTranscricao, type PacoteTranscricao } from "../scripts/lib/falas-transcricao"
import { CANAL_AVIVAR } from "../scripts/lib/falas-evidencia-video"
import { CANAL_THE_PAPO, FONTE_THE_PAPO, intervaloSemanaPublicacao, lerPlayerYoutube } from "../scripts/lib/falas-video-gravado"

const hashBytes = (value: Buffer) => createHash("sha256").update(value).digest("hex")

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

function carlosAvivarFixture() {
  const candidate: CandidatoFalas = {
    id: "51e9be3d-bd06-45e5-828d-48160265925f", slug: "carlos-jararaca",
    nome_urna: "Carlos Jararaca", nome_completo: "Carlos Alberto de Almeida Cavalcante",
    estado: "RN", cargo_disputado: "Governador",
  }
  const url = "https://www.youtube.com/watch?v=5qKR3B6rQnI"
  const title = "Podcast Ponto de Vista - Convidado: Carlos Jararaca"
  const metadata = JSON.stringify({
    id: "5qKR3B6rQnI", webpage_url: url, channel_id: CANAL_AVIVAR, channel: "Rádio Avivar Evangélica",
    uploader: "Rádio Avivar Evangélica", uploader_url: "https://www.youtube.com/@webradioavivar", title,
    was_live: true, live_status: "was_live", duration: 4269, release_timestamp: 1787781722,
  })
  const transcript = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nO estado hoje é\n\n00:00:01.000 --> 00:00:02.000\nO estado hoje é um<c> estado sucateado.</c>\n`
  const verification = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\no Estado hoje é um Estado sucateado.\n`
  const audio = wav()
  const quoteText = "O estado hoje é um estado sucateado."
  const quote: FalaCandidato = {
    id: sha256(`${candidate.id}:2026-08-26:o estado hoje e um estado sucateado`), candidate_id: candidate.id,
    candidate_slug: candidate.slug, candidate_name: candidate.nome_urna, office: candidate.cargo_disputado, uf: candidate.estado,
    quote_text: quoteText, context: quoteText,
    event_context: "Entrevista no Podcast Ponto de Vista, da Rádio Avivar Evangélica, com Carlos Jararaca.", event_type: "entrevista", occurred_on: "2026-08-26",
    publisher: "Rádio Avivar Evangélica", article_url: url, article_title: title,
    article_published_at: "2026-08-26T22:02:02Z", observed_at: "2026-09-12T19:15:55.485907Z",
    source_sha256: sha256(metadata), attribution: "source_context_review",
    collection_scope: { mode: "initial_backfill", from: "2026-08-16" },
    transcription: { kind: "automatic", media_url: url, start_seconds: 0, end_seconds: 1,
      media_published_at: "2026-08-26T22:02:02Z", engine: "YouTube pt captions plus local Whisper small pt",
      transcript_sha256: sha256(transcript), verification_sha256: sha256(verification), audio_sha256: hashBytes(audio),
      speaker_context: "A legenda identifica Carlos Jararaca como candidato e o trecho selecionado contém a resposta.", reviewed_context: true },
    review_evidence: { identity_excerpt: title, date_excerpt: title, fetched_url: url, method: "codex_source_review",
      live_video: { url, channel_id: CANAL_AVIVAR, broadcast_on: "2026-08-26", release_timestamp: 1787781722,
        metadata_sha256: sha256(metadata), captions_sha256: sha256(transcript), frame_sha256: hashBytes(Buffer.from("frame")),
        frame_at_seconds: 0.5, article_event_excerpt: title, quote_excerpt: quoteText, reviewed_live_on_air: true } },
  }
  return { candidate, quote, evidence: { article: metadata, audio, transcript, verification, metadata, frame: Buffer.from("frame") } satisfies PacoteTranscricao }
}

test("aceita o episódio Avivar allowlisted e une cues VTT com tags inline", () => {
  const f = carlosAvivarFixture()
  assert.doesNotThrow(() => verificarTranscricao(f.quote, f.candidate, f.evidence))
})

test("não abre o caminho JSON do episódio Avivar para outro candidato", () => {
  const f = carlosAvivarFixture()
  f.candidate = { ...f.candidate, id: "outro-candidato", slug: "outro-candidato", nome_urna: "Outro Candidato", nome_completo: "Outro Candidato" }
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, f.evidence), /Identidade da transcrição divergente|Autoria não identificada|Página original/)
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

function victorDcoFixture() {
  const candidate: CandidatoFalas = { id: "2cb5e948-08ea-4a25-8124-6aaac3155c70", slug: "victor-assis", nome_urna: "Victor Assis", nome_completo: "Victor Assis da Silva", estado: "PE", cargo_disputado: "Governador" }
  const articleUrl = "https://causaoperaria.org.br/2026/rui-costa-pimenta-analisa-a-crescente-tensao-entre-turquia-e-israel/"
  const mediaUrl = "https://www.youtube.com/watch?v=w3CAsXoCxwM"
  const channel = "UCvhnOzbSDblzftMPLe8D4-A"
  const identity = "Victor Assis (PCO) O candidato participou, à tarde, de um programa do canal do YouTube “Diário Causa Operária”, junto ao presidente nacional do PCO, Rui Costa Pimenta."
  const dateExcerpt = "Nesta quinta-feira (20), cinco dos oito candidatos ao governo de Pernambuco realizaram atos públicos de campanha. Entre as atividades, estavam entrevistas, porta a porta, sabatina e presença em eventos."
  const event = "O Diário Causa Operária (jornal do PCO) transmitiu o programa Análise Internacional em 20/08/2026."
  const quoteText = "Perguntei sobre a situação na Ucrânia."
  const article = `<link rel="canonical" href="${articleUrl}"><meta property="article:published_time" content="2026-08-21T12:00:00Z"><p>${event}</p><p>“${quoteText}”, perguntou o apresentador.</p><p>Vídeo original: ${mediaUrl}</p>`
  const supportRaw = `<link rel="canonical" href="https://g1.globo.com/pe/pernambuco/eleicoes/2026/noticia/2026/08/20/porta-a-porta-entrevistas-e-sabatina-como-foi-o-5o-dia-de-campanha-dos-candidatos-ao-governo-de-pernambuco.ghtml"><article><div class="mc-column content-text"><p>${dateExcerpt}</p></div><div class="mc-column content-text"><p class="content-text__container"><div class="content-intertitle"><h2>Victor Assis (PCO)</h2></div></p></div><div class="mc-column content-text"><p>${identity.slice("Victor Assis (PCO) ".length)} À noite, integrou reunião plenária.</p></div><div class="mc-column content-text"><p class="content-text__container"><div class="content-intertitle"><h2>Outro Candidato (PCO)</h2></div></p></div><div class="mc-column content-text"><p>Outro Candidato participou de outro evento em 20/08/2026.</p></div></article>`.replaceAll("><div", ">\n<div")
  const audio = wav()
  const transcript = quoteText
  const metadata = JSON.stringify({ id: "w3CAsXoCxwM", webpage_url: mediaUrl, channel_id: channel, title: "Análise Internacional nº 274 - 20/08/2026", description: "Diário Causa Operária", duration: 3790, was_live: true, live_status: "was_live", release_timestamp: 1787241581 })
  const frame = Buffer.from("victor dco frame")
  const quote: FalaCandidato = {
    id: sha256("2cb5e948-08ea-4a25-8124-6aaac3155c70:2026-08-20:perguntei sobre a situacao na ucrania"),
    candidate_id: candidate.id, candidate_slug: candidate.slug, candidate_name: candidate.nome_urna,
    office: candidate.cargo_disputado, uf: candidate.estado, quote_text: quoteText, context: quoteText,
    event_context: "Entrevista no programa Análise Internacional", event_type: "entrevista", occurred_on: "2026-08-20",
    publisher: "Diário Causa Operária (jornal do PCO)", article_url: articleUrl, article_title: "Rui Costa Pimenta analisa a crescente tensão",
    article_published_at: "2026-08-21T12:00:00Z", observed_at: "2026-09-12T12:00:00Z", source_sha256: sha256(article), attribution: "source_context_review",
    collection_scope: { mode: "initial_backfill", from: "2026-08-16" },
    transcription: { kind: "automatic", media_url: mediaUrl, start_seconds: 0, end_seconds: 1, media_published_at: "2026-08-20T15:59:41.000Z", engine: "local fixture", transcript_sha256: sha256(transcript), verification_sha256: sha256(transcript), audio_sha256: hashBytes(audio), speaker_context: "A identidade textual vem de apoio G1 e o evento do vídeo é conferido na matéria DCO.", reviewed_context: true },
    review_evidence: { identity_excerpt: identity, date_excerpt: event, fetched_url: articleUrl, method: "codex_source_review",
      supporting_sources: [{ url: "https://g1.globo.com/pe/pernambuco/eleicoes/2026/noticia/2026/08/20/porta-a-porta-entrevistas-e-sabatina-como-foi-o-5o-dia-de-campanha-dos-candidatos-ao-governo-de-pernambuco.ghtml", sha256: sha256(supportRaw), excerpts: [identity, dateExcerpt] }],
      live_video: { url: mediaUrl, channel_id: channel, broadcast_on: "2026-08-20", release_timestamp: 1787241581, metadata_sha256: sha256(metadata), captions_sha256: sha256(transcript), frame_sha256: hashBytes(frame), frame_at_seconds: 0.5, article_event_excerpt: event, quote_excerpt: quoteText, reviewed_live_on_air: true } },
  }
  return { candidate, quote, evidence: { article, audio, transcript, verification: transcript, metadata, frame, supporting: [{ url: "https://g1.globo.com/pe/pernambuco/eleicoes/2026/noticia/2026/08/20/porta-a-porta-entrevistas-e-sabatina-como-foi-o-5o-dia-de-campanha-dos-candidatos-ao-governo-de-pernambuco.ghtml", raw: supportRaw }] } satisfies PacoteTranscricao }
}

test("aceita identidade em apoio G1 quando o apoio prova candidato, emissora e mesmo evento datado", () => {
  const f = victorDcoFixture()
  assert.doesNotThrow(() => verificarTranscricao(f.quote, f.candidate, f.evidence))
})

test("rejeita apoio Victor desvinculado, adulterado, candidato divergente ou episódio fora da allowlist", () => {
  const f = victorDcoFixture()
  const support = f.evidence.supporting![0]
  const changedDate = "Nesta sexta-feira (21), cinco dos oito candidatos ao governo de Pernambuco realizaram atos públicos de campanha. Entre as atividades, estavam entrevistas, porta a porta, sabatina e presença em eventos."
  const changedDateRaw = support.raw.replace("Nesta quinta-feira (20),", "Nesta sexta-feira (21),")
  assert.throws(() => verificarTranscricao({ ...f.quote, review_evidence: { ...f.quote.review_evidence!, supporting_sources: [{ ...support, sha256: sha256(changedDateRaw), excerpts: [f.quote.review_evidence!.identity_excerpt!, changedDate] }] } }, f.candidate, { ...f.evidence, supporting: [{ ...support, raw: changedDateRaw }] }), /vínculo ao evento/)
  assert.throws(() => verificarTranscricao(f.quote, f.candidate, { ...f.evidence, supporting: [{ ...support, raw: support.raw + " adulterado" }] }), /Autoria apoiada sem fonte íntegra/)
  assert.throws(() => verificarTranscricao(f.quote, { ...f.candidate, nome_urna: "Outro Candidato", nome_completo: "Outro Candidato Silva" }, f.evidence), /Autoria não identificada pelo veículo/)
  const otherIdentity = "Outro Candidato participou, à tarde, de um programa do canal Diário Causa Operária em 20/08/2026."
  assert.throws(() => verificarTranscricao({ ...f.quote, review_evidence: { ...f.quote.review_evidence!, identity_excerpt: otherIdentity, supporting_sources: [{ ...support, sha256: sha256(support.raw.replace(f.quote.review_evidence!.identity_excerpt!, otherIdentity)), excerpts: [otherIdentity] }] } }, f.candidate, { ...f.evidence, supporting: [{ ...support, raw: support.raw.replace(f.quote.review_evidence!.identity_excerpt!, otherIdentity) }] }), /Autoria não identificada pelo veículo/)
  assert.throws(() => verificarTranscricao({ ...f.quote, publisher: "Fonte desconhecida" }, f.candidate, f.evidence), /Veículo da transcrição não aprovado/)
  const otherUrl = "https://www.youtube.com/watch?v=abcdefghijk"
  assert.throws(() => verificarTranscricao({ ...f.quote, transcription: { ...f.quote.transcription!, media_url: otherUrl }, review_evidence: { ...f.quote.review_evidence!, live_video: { ...f.quote.review_evidence!.live_video!, url: otherUrl } } }, f.candidate, f.evidence), /vínculo revisado/)
})

test("não usa parágrafo de outra seção para completar a identidade do Victor", () => {
  const f = victorDcoFixture()
  const support = f.evidence.supporting![0]
  const proof = f.quote.review_evidence!.supporting_sources![0]
  const otherParagraph = `<p>${f.quote.review_evidence!.identity_excerpt!.slice("Victor Assis (PCO) ".length)}</p>`
  const raw = support.raw.replace(
    `<p>${f.quote.review_evidence!.identity_excerpt!.slice("Victor Assis (PCO) ".length)} À noite, integrou reunião plenária.</p>`,
    `<p>Victor Assis não teve agenda informada.</p></div><div class="mc-column content-text"><p class="content-text__container"><div class="content-intertitle"><h2>Outro Candidato (PCO)</h2></div></p></div><div class="mc-column content-text">${otherParagraph}`,
  )
  assert.match(raw, /Outro Candidato \(PCO\)/)
  const quote = {
    ...f.quote,
    review_evidence: {
      ...f.quote.review_evidence!,
      supporting_sources: [{ ...proof, sha256: sha256(raw) }],
    },
  }
  assert.throws(() => verificarTranscricao(quote, f.candidate, {
    ...f.evidence,
    supporting: [{ ...support, raw }],
  }), /vínculo ao evento/)
})

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
