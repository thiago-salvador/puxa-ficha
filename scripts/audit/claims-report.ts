/**
 * Fichário das claims (pontos de atenção) por candidato, 2026-08-02.
 *
 * Uma linha por CLAIM, não por candidato. Existe para a revisão em lote de um
 * recorte específico, hoje a disputa presidencial, com tudo que decide se a
 * claim pode ir ao ar: texto publicado, categoria, gravidade, se está no ar,
 * quem escreveu (IA ou curadoria), se passou por revisão humana, e o estado
 * REAL de cada URL de fonte, sondada na hora com o mesmo prober do gate
 * `data:link-check-fontes` (`analisarSubstancia`, que reprova casca de SPA
 * respondendo 200).
 *
 * Não escreve em banco. Gera um HTML e, opcionalmente, o JSON das sondagens.
 * As decisões vão para o mesmo endpoint das outras páginas de revisão.
 *
 * Uso:
 *   tsx scripts/audit/claims-report.ts --from-snapshot=snapshot.json --cargo=Presidente --probar
 *
 * Flags:
 *   --from-snapshot=PATH  OBRIGATÓRIA. JSON de `coverage-snapshot.sql` (campo `claims`)
 *   --uf=SP               filtra por UF (Governador daquele estado). Ignora --cargo.
 *   --cargo=NOME          filtra por `cargo_disputado` (default: Presidente)
 *   --slugs=a,b           filtra por slug, ignora --uf e --cargo
 *   --out=PATH            HTML de saída
 *   --probar              sonda as URLs de fonte e mostra o estado de cada uma
 *   --probes=PATH         reaproveita sondagem anterior em vez de ir à rede
 *   --review-post=URL     endpoint das decisões (default: /revisao)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

import {
  mapPorHost,
  probeUrlReal,
  type ProbeOpcoes,
  type UrlProbe,
} from "../link-check-pontos-atencao"

interface Claim {
  id: string
  categoria: string | null
  gravidade: string | null
  titulo: string
  descricao: string | null
  visivel: boolean | null
  verificado: boolean | null
  gerado_por: string | null
  despublicacao_motivo: string | null
  data_referencia: string | null
  urls: string[]
}

interface CandidatoSnapshot {
  slug: string
  nome_urna: string
  partido_sigla: string | null
  cargo_disputado: string | null
  estado: string | null
  claims: Claim[]
}

function flag(nome: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${nome}` || a.startsWith(`--${nome}=`))
  if (!hit) return undefined
  const i = hit.indexOf("=")
  return i === -1 ? "" : hit.slice(i + 1)
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Estado publicado da claim, na linguagem do leitor. */
function statusDaClaim(c: Claim): { chave: string; rotulo: string } {
  if (c.visivel) return { chave: "no-ar", rotulo: "No ar" }
  if (c.despublicacao_motivo) return { chave: "despublicada", rotulo: "Despublicada" }
  return { chave: "fora", rotulo: "Fora do ar" }
}

const ROTULO_URL: Record<string, string> = {
  viva: "fonte viva",
  morta: "fonte morta",
  indisponivel: "indisponível agora",
  sem_substancia: "abre, mas sem conteúdo",
  sem_caminho: "sem caminho",
}

const CSS = `
:root{color-scheme:light;--bg:#fafaf8;--fg:#1a1a1a;--muted:#6b6b6b;--line:#e4e2dc;--card:#fff;
--ok:#1c6b2d;--okbg:#e3f2e6;--bad:#a12622;--badbg:#fbe4e4;--warn:#8a6100;--warnbg:#fdf3d7;--accent:#1f4fd8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:26px 20px 150px}
main{max-width:1560px;margin:0 auto}
h1{font-size:24px;margin:8px 0 4px}
.sub{color:var(--muted);margin:0 0 16px;font-size:13.5px;max-width:1000px}
a.voltar{color:var(--muted);text-decoration:none;font-size:13px}
a.voltar:hover{text-decoration:underline}
.barra{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:11px 14px;margin-bottom:14px;font-size:13px}
.barra select,.barra input[type=search]{border:1px solid var(--line);border-radius:8px;padding:6px 9px;font:inherit;font-size:13px;background:#fff}
.barra button{background:#fff;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer}
.barra button:hover{border-color:var(--accent)}
.contador{margin-left:auto;font-weight:700}
.twrap{border:1px solid var(--line);border-radius:11px;background:var(--card);overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13px}
thead th{position:sticky;top:0;background:#f4f3ef;z-index:2;text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
tr.primeira-do-candidato td{border-top:2px solid #dcdad3}
tr.decidida{background:#fbfbf9}
.num{font-weight:700;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cand{font-weight:700;white-space:nowrap}
.cand a{color:var(--fg);text-decoration:none}
.cand a:hover{text-decoration:underline}
.meta{color:var(--muted);font-size:12px}
.nowrap{white-space:nowrap}
.pill{display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 7px;border-radius:999px;white-space:nowrap}
.st-no-ar{background:var(--okbg);color:var(--ok)}
.st-fora{background:var(--warnbg);color:var(--warn)}
.st-despublicada{background:#f1f1ee;color:#7a7a74}
.g-critica{background:var(--badbg);color:var(--bad)}
.g-alta{background:var(--badbg);color:var(--bad)}
.g-media{background:var(--warnbg);color:var(--warn)}
.g-baixa{background:#f1f1ee;color:#7a7a74}
.ia{background:var(--warnbg);color:var(--warn)}
.humana{background:var(--okbg);color:var(--ok)}
.claim{max-width:560px}
.claim b{display:block;margin-bottom:3px}
.motivo{margin-top:6px;font-size:12px;color:var(--bad);background:var(--badbg);border-radius:7px;padding:6px 9px}
.fontes{max-width:290px;font-size:12px}
.fontes div{margin-bottom:6px;word-break:break-all}
.u-viva{color:var(--ok);font-weight:700}
.u-morta,.u-sem_caminho{color:var(--bad);font-weight:700}
.u-sem_substancia,.u-indisponivel{color:var(--warn);font-weight:700}
.dec{white-space:nowrap}
.dec label{display:inline-block;margin-right:7px;cursor:pointer;font-weight:600;font-size:12.5px}
.dec label.ap{color:var(--ok)} .dec label.rj{color:var(--bad)} .dec label.ad{color:var(--muted)}
.rodape{position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,.97);border-top:1px solid var(--line);padding:12px 20px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}
.rodape button{background:#1a1a1a;color:#fff;border:0;border-radius:10px;padding:11px 26px;font-size:15px;font-weight:600;cursor:pointer}
.rodape input[type=text]{border:1px solid var(--line);border-radius:9px;padding:9px 11px;font:inherit;font-size:14px;min-width:330px}
#msg{font-weight:600}
`

interface Linha {
  cand: CandidatoSnapshot
  claim: Claim
  primeira: boolean
}

function render(linhas: Linha[], probes: Map<string, UrlProbe>, postUrl: string, cargo: string): string {
  const categorias = [...new Set(linhas.map((l) => l.claim.categoria).filter(Boolean))] as string[]

  const trs = linhas
    .map(({ cand, claim, primeira }, i) => {
      const st = statusDaClaim(claim)
      const grav = (claim.gravidade ?? "baixa").toLowerCase()
      const proveniencia =
        claim.gerado_por === "ia"
          ? `<span class="pill ia">IA ${claim.verificado ? "revisada" : "sem revisão"}</span>`
          : `<span class="pill humana">curadoria</span>`

      const fontes = claim.urls.length
        ? claim.urls
            .map((u) => {
              const p = probes.get(u)
              const estado = p
                ? `<span class="u-${p.status}">${esc(ROTULO_URL[p.status] ?? p.status)}${p.httpStatus ? ` (${p.httpStatus})` : ""}</span>`
                : `<span class="meta">não sondada</span>`
              return `<div><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, "").slice(0, 58))}</a><br>${estado}</div>`
            })
            .join("")
        : `<div class="meta">sem URL de fonte</div>`

      const motivo = claim.despublicacao_motivo
        ? `<div class="motivo"><b>Motivo da despublicação:</b> ${esc(claim.despublicacao_motivo)}</div>`
        : ""

      const busca = [
        cand.nome_urna,
        cand.partido_sigla ?? "",
        claim.titulo,
        claim.descricao ?? "",
        claim.categoria ?? "",
      ]
        .join(" ")
        .toLowerCase()

      return `<tr class="${primeira ? "primeira-do-candidato" : ""}" data-i="${i}"
  data-slug="${esc(cand.slug)}" data-status="${st.chave}" data-grav="${esc(grav)}"
  data-cat="${esc(claim.categoria ?? "")}" data-prov="${claim.gerado_por === "ia" ? (claim.verificado ? "ia-revisada" : "ia-sem-revisao") : "curadoria"}"
  data-busca="${esc(busca)}" data-num="${i + 1}">
  <td class="num">${i + 1}</td>
  <td class="cand"><a href="https://puxaficha.com.br/candidato/${esc(cand.slug)}" target="_blank" rel="noopener">${esc(cand.nome_urna)}</a></td>
  <td class="meta nowrap">${esc(cand.partido_sigla ?? "—")}</td>
  <td class="meta nowrap">${esc(cand.estado ?? "BR")}</td>
  <td class="meta nowrap">${esc(cand.cargo_disputado ?? "—")}</td>
  <td class="nowrap"><span class="pill st-${st.chave}">${esc(st.rotulo)}</span></td>
  <td class="nowrap"><span class="pill g-${esc(grav)}">${esc(grav)}</span></td>
  <td class="meta nowrap">${esc(claim.categoria ?? "—")}</td>
  <td class="nowrap">${proveniencia}</td>
  <td class="claim"><b>${esc(claim.titulo)}</b>${claim.descricao ? esc(claim.descricao) : '<span class="meta">sem texto</span>'}${motivo}</td>
  <td class="fontes">${fontes}</td>
  <td class="dec">
    <label class="ap"><input type="radio" name="d${i}" value="aprovar">Aprovar</label>
    <label class="rj"><input type="radio" name="d${i}" value="rejeitar">Rejeitar</label>
    <label class="ad"><input type="radio" name="d${i}" value="adiar" checked>Depois</label>
  </td>
</tr>`
    })
    .join("")

  // O numero exibido viaja junto na decisao: e por ele que a conversa sobre a
  // fila acontece ("a claim 14"), entao ele precisa existir do lado de la tambem.
  const dados = linhas.map(({ cand, claim }, i) => ({
    numero: i + 1,
    slug: cand.slug,
    id: claim.id,
    classe: "claim_ponto_atencao",
    titulo: claim.titulo,
  }))

  const sondadas = [...probes.values()]
  const resumoSondagem = sondadas.length
    ? `${sondadas.filter((p) => p.status === "viva").length} viva(s), ` +
      `${sondadas.filter((p) => p.status === "morta").length} morta(s), ` +
      `${sondadas.filter((p) => p.status === "sem_substancia").length} sem conteúdo, ` +
      `${sondadas.filter((p) => p.status === "indisponivel").length} indisponível(is), de ${sondadas.length} URL(s)`
    : "URLs não sondadas nesta geração"

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Claims · ${esc(cargo)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<a class="voltar" href="lote.html">Ir para a revisão em lote geral</a>
<h1>Claims dos candidatos a ${esc(cargo)}</h1>
<p class="sub">${linhas.length} claim(s) de ${new Set(linhas.map((l) => l.cand.slug)).size} candidato(s), publicadas ou não.
Uma linha por claim; quem tem mais de uma aparece em linhas seguidas.
O numero da coluna Claim # e fixo e nao muda com filtro, entao serve para falar de uma claim especifica.
Estado das fontes conferido agora com o mesmo prober do gate de link-check: ${esc(resumoSondagem)}.
Nada aqui muda o site: o envio grava suas decisões e a aplicação é passo separado, com migration e readback.</p>

<div class="barra">
  <label>Status <select id="fStatus"><option value="">todos</option><option value="no-ar">No ar</option><option value="fora">Fora do ar</option><option value="despublicada">Despublicada</option></select></label>
  <label>Gravidade <select id="fGrav"><option value="">todas</option><option value="critica">crítica</option><option value="alta">alta</option><option value="media">média</option><option value="baixa">baixa</option></select></label>
  <label>Origem <select id="fProv"><option value="">todas</option><option value="ia-sem-revisao">IA sem revisão</option><option value="ia-revisada">IA revisada</option><option value="curadoria">Curadoria</option></select></label>
  <label>Categoria <select id="fCat"><option value="">todas</option>${categorias.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>
  <input type="search" id="fBusca" placeholder="filtrar por texto">
  <button type="button" id="bAprovar">Aprovar visíveis</button>
  <button type="button" id="bRejeitar">Rejeitar visíveis</button>
  <button type="button" id="bLimpar">Limpar visíveis</button>
  <span class="contador" id="contador"></span>
</div>

<div class="twrap"><table>
<thead><tr>
  <th>Claim #</th><th>Candidato</th><th>Partido</th><th>UF</th><th>Cargo</th><th>Status</th><th>Gravidade</th>
  <th>Categoria</th><th>Origem</th><th>Claim</th><th>Fontes</th><th>Decisão</th>
</tr></thead>
<tbody id="corpo">${trs}</tbody>
</table></div>
</main>

<div class="rodape">
  <input type="text" id="livre" placeholder="Observação livre para este envio (opcional)">
  <button type="button" id="enviar">Enviar decisões</button>
  <span id="msg"></span>
</div>

<script>
const DADOS = ${JSON.stringify(dados)};
const corpo = document.getElementById('corpo');
const linhas = Array.from(corpo.querySelectorAll('tr'));
function visiveis(){ return linhas.filter(t => t.style.display !== 'none'); }
function decisaoDe(tr){ const s = tr.querySelector('input[type=radio]:checked'); return s ? s.value : 'adiar'; }
function atualizar(){
  let n = 0;
  for (const tr of linhas){ const d = decisaoDe(tr); tr.classList.toggle('decidida', d !== 'adiar'); if (d !== 'adiar') n++; }
  document.getElementById('contador').textContent = n + ' de ' + linhas.length + ' decidida(s) · ' + visiveis().length + ' visível(is)';
}
function filtrar(){
  const st = document.getElementById('fStatus').value;
  const g = document.getElementById('fGrav').value;
  const p = document.getElementById('fProv').value;
  const c = document.getElementById('fCat').value;
  const q = document.getElementById('fBusca').value.trim().toLowerCase();
  for (const tr of linhas){
    const ok = (!st || tr.dataset.status === st) && (!g || tr.dataset.grav === g)
      && (!p || tr.dataset.prov === p) && (!c || tr.dataset.cat === c)
      && (!q || tr.dataset.busca.includes(q));
    tr.style.display = ok ? '' : 'none';
  }
  atualizar();
}
function marcar(v){ for (const tr of visiveis()){ const r = tr.querySelector('input[type=radio][value="' + v + '"]'); if (r) r.checked = true; } atualizar(); }
for (const id of ['fStatus','fGrav','fProv','fCat']) document.getElementById(id).addEventListener('change', filtrar);
document.getElementById('fBusca').addEventListener('input', filtrar);
document.getElementById('bAprovar').addEventListener('click', () => marcar('aprovar'));
document.getElementById('bRejeitar').addEventListener('click', () => marcar('rejeitar'));
document.getElementById('bLimpar').addEventListener('click', () => marcar('adiar'));
corpo.addEventListener('change', atualizar);
document.getElementById('enviar').addEventListener('click', async () => {
  const msg = document.getElementById('msg');
  const porSlug = new Map();
  linhas.forEach((tr, i) => {
    const d = decisaoDe(tr);
    if (d === 'adiar') return;
    const m = DADOS[i];
    if (!porSlug.has(m.slug)) porSlug.set(m.slug, []);
    porSlug.get(m.slug).push({ numero: m.numero, id: m.id, classe: m.classe, titulo: m.titulo, decisao: d });
  });
  if (porSlug.size === 0){ msg.textContent = 'Nenhuma decisão marcada.'; msg.style.color = '#8a6100'; return; }
  const livre = document.getElementById('livre').value;
  let ok = 0, falha = 0;
  for (const [slug, decisoes] of porSlug){
    try {
      const r = await fetch(${JSON.stringify(postUrl)}, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ slug, decisoes, livre, origem: 'claims' }) });
      if (r.ok) ok += decisoes.length; else falha += decisoes.length;
    } catch(e){ falha += decisoes.length; }
  }
  msg.textContent = falha === 0 ? ok + ' decisão(ões) enviada(s) em ' + porSlug.size + ' candidato(s).' : ok + ' enviada(s), ' + falha + ' falharam.';
  msg.style.color = falha === 0 ? '#1c6b2d' : '#a12622';
});
filtrar();
</script>
</body>
</html>`
}

async function main(): Promise<void> {
  const snapshot = flag("from-snapshot")
  if (!snapshot) throw new Error("--from-snapshot=PATH é obrigatório")
  const uf = (flag("uf") || "").trim().toUpperCase()
  const cargo = flag("cargo") || "Presidente"
  const slugsFlag = flag("slugs")
  const slugs = slugsFlag ? new Set(slugsFlag.split(",").map((s) => s.trim())) : null
  // Rotulo e nome de arquivo seguem o recorte pedido, para os HTMLs de UF
  // conviverem lado a lado sem se sobrescrever.
  const rotulo = uf ? `Governador · ${uf}` : cargo
  const nomeArquivo = uf ? `claims-uf-${uf.toLowerCase()}.html` : `claims-${cargo.toLowerCase()}.html`
  const out = flag("out") || join(homedir(), ".disposable-html", "revisao", nomeArquivo)
  const postUrl = flag("review-post") || "/revisao"

  const todos = JSON.parse(readFileSync(snapshot, "utf8")) as CandidatoSnapshot[]
  const coorte = todos.filter((c) => {
    if (slugs) return slugs.has(c.slug)
    if (uf) return c.estado === uf
    return c.cargo_disputado === cargo
  })
  if (coorte.length === 0) {
    throw new Error(
      uf
        ? `nenhum candidato publico com estado = ${uf} no snapshot`
        : `nenhum candidato publico com cargo_disputado = ${cargo} no snapshot`
    )
  }

  const linhas: Linha[] = []
  for (const cand of [...coorte].sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))) {
    ;(cand.claims ?? []).forEach((claim, i) => linhas.push({ cand, claim, primeira: i === 0 }))
  }

  const urls = [...new Set(linhas.flatMap((l) => l.claim.urls))]
  const probes = new Map<string, UrlProbe>()

  const cacheProbes = flag("probes")
  if (cacheProbes && existsSync(cacheProbes)) {
    for (const p of JSON.parse(readFileSync(cacheProbes, "utf8")) as UrlProbe[]) probes.set(p.url, p)
    console.error(`[claims] ${probes.size} sondagem(ns) reaproveitada(s) de ${cacheProbes}`)
  } else if (flag("probar") !== undefined) {
    console.error(`[claims] sondando ${urls.length} URL(s)...`)
    const opcoes: ProbeOpcoes = { timeoutMs: 20000, maxBytes: 512 * 1024, retryDelayMs: 5000 }
    const resultados = await mapPorHost(urls, 6, 1500, (u) => probeUrlReal(u, opcoes))
    for (const p of resultados) probes.set(p.url, p)
    if (cacheProbes) {
      mkdirSync(dirname(cacheProbes), { recursive: true })
      writeFileSync(cacheProbes, JSON.stringify(resultados, null, 2), "utf8")
    }
  }

  const html = render(linhas, probes, postUrl, rotulo)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html, "utf8")
  console.error(
    `[claims] ${linhas.length} claim(s) de ${coorte.length} candidato(s) -> ${out} (${html.length} bytes)`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
