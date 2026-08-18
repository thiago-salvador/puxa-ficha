import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Recomendacao = "publicar" | "ponto_atencao" | "nao_publicar" | "pesquisar_mais";

type Triagem = {
  slug: string;
  nome_completo: string;
  numero_cnj: string;
  recomendacao: Recomendacao;
  motivo: string;
  vinculacao: "pessoal" | "campanha" | "empresa" | "institucional" | "terceiro";
  relevancia: "alta" | "media" | "baixa";
  duplicidade: { duplicado: boolean; grupo: string | null; motivo: string | null };
  confianca: "alta" | "media" | "baixa";
  fonte_oficial: string;
  grupo_editorial?: string;
};

type Processo = {
  numero_cnj: string;
  tribunal: string;
  classe: string;
  orgao: string;
  polo: string;
  url: string;
  contexto_identidade: string;
  datajud?: { status?: string; motivo?: string };
};

type Candidato = {
  slug: string;
  nome_urna: string;
  nome_completo: string;
  cargo: string;
  uf: string;
  partido: string;
  processos?: Processo[];
};

type ReviewItem = Triagem & Processo & {
  nome_urna: string;
  cargo: string;
  uf: string;
  partido: string;
};

function arg(nome: string): string {
  const prefixo = `--${nome}=`;
  const valor = process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length);
  if (!valor) throw new Error(`Argumento obrigatorio ausente: ${prefixo}CAMINHO`);
  return resolve(valor);
}

function lerJson(caminho: string): unknown {
  return JSON.parse(readFileSync(caminho, "utf8"));
}

function itensTriagem(valor: unknown): Triagem[] {
  const raiz = valor as { itens?: unknown[]; triagem?: unknown[] };
  const brutos = Array.isArray(valor)
    ? valor
    : Array.isArray(raiz?.itens)
      ? raiz.itens
      : Array.isArray(raiz?.triagem)
        ? raiz.triagem
        : null;
  if (brutos) {
    return brutos.map((bruto) => {
      const item = bruto as Record<string, unknown>;
      const vinculo = String(item.vinculacao ?? item.tipo_vinculo ?? "terceiro");
      const vinculacao: Triagem["vinculacao"] = vinculo === "campanha_ou_empresa"
        ? "empresa"
        : (["pessoal", "campanha", "empresa", "institucional", "terceiro"].includes(vinculo)
          ? vinculo as Triagem["vinculacao"]
          : "terceiro");
      const duplicidadeBruta = item.duplicidade;
      const duplicidade = duplicidadeBruta && typeof duplicidadeBruta === "object"
        ? duplicidadeBruta as Triagem["duplicidade"]
        : {
            duplicado: typeof duplicidadeBruta === "string" && !/^(nao|não|nenhuma|sem)\b/i.test(duplicidadeBruta),
            grupo: null,
            motivo: typeof duplicidadeBruta === "string" ? duplicidadeBruta : null,
          };
      return {
        slug: String(item.slug ?? ""),
        nome_completo: String(item.nome_completo ?? ""),
        numero_cnj: String(item.numero_cnj ?? item.cnj ?? ""),
        recomendacao: item.recomendacao as Recomendacao,
        motivo: String(item.motivo ?? ""),
        vinculacao,
        relevancia: item.relevancia as Triagem["relevancia"],
        duplicidade,
        confianca: item.confianca as Triagem["confianca"],
        fonte_oficial: String(item.fonte_oficial ?? ""),
        grupo_editorial: item.grupo_editorial ? String(item.grupo_editorial) : undefined,
      };
    });
  }
  throw new Error("Triagem invalida: esperado array ou objeto com itens[]");
}

function escaparScript(valor: unknown): string {
  return JSON.stringify(valor).replaceAll("<", "\\u003c");
}

function validarTriagem(itens: Triagem[]): void {
  const permitidas = new Set<Recomendacao>(["publicar", "ponto_atencao", "nao_publicar", "pesquisar_mais"]);
  const vinculacoes = new Set(["pessoal", "campanha", "empresa", "institucional", "terceiro"]);
  const niveis = new Set(["alta", "media", "baixa"]);
  const vistos = new Set<string>();
  for (const item of itens) {
    if (
      !item.numero_cnj || !item.slug || !item.motivo || !permitidas.has(item.recomendacao) ||
      !vinculacoes.has(item.vinculacao) || !niveis.has(item.relevancia) || !niveis.has(item.confianca)
    ) {
      throw new Error(`Item de triagem incompleto: ${JSON.stringify(item)}`);
    }
    if (vistos.has(item.numero_cnj)) throw new Error(`CNJ duplicado na triagem: ${item.numero_cnj}`);
    vistos.add(item.numero_cnj);
  }
}

function html(itens: ReviewItem[], resumo: Record<Recomendacao, number>): string {
  const dados = escaparScript({ itens, resumo, gerado_em: new Date().toISOString() });
  const gruposPonto = new Set(
    itens
      .filter((item) => item.recomendacao === "ponto_atencao")
      .map((item) => (item as ReviewItem & { grupo_editorial?: string }).grupo_editorial ?? item.numero_cnj),
  ).size;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisão editorial de processos | Puxa Ficha</title>
<style>
:root{color-scheme:light;--bg:#f5f3ee;--paper:#fff;--ink:#17211b;--muted:#5f6b63;--line:#d9ddd7;--green:#176b46;--amber:#9a5a00;--red:#9f2d2d;--blue:#155f85}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1180px;margin:auto;padding:32px 20px 120px}h1{font-size:clamp(28px,4vw,46px);line-height:1.05;max-width:850px;margin:0 0 14px}h2{font-size:21px;margin:0 0 10px}p{margin:6px 0}.lede{font-size:18px;max-width:880px;color:#34423a}.notice,.rubrica,.candidate{background:var(--paper);border:1px solid var(--line);border-radius:16px}.notice{padding:18px;margin:22px 0;border-left:6px solid var(--blue)}.rubrica{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;overflow:hidden;margin:22px 0}.rubrica article{padding:18px;background:#fff}.rubrica strong{display:block;font-size:17px;margin-bottom:5px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.metric{padding:16px;border-radius:14px;background:#fff;border:1px solid var(--line)}.metric b{display:block;font-size:28px}.metric.pub b{color:var(--green)}.metric.point b{color:var(--blue)}.metric.no b{color:var(--red)}.metric.more b{color:var(--amber)}.toolbar{position:sticky;top:0;z-index:5;background:rgba(245,243,238,.96);backdrop-filter:blur(8px);padding:14px 0;border-bottom:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;align-items:end}.field{display:grid;gap:4px}.field label{font-size:12px;font-weight:700;color:var(--muted)}select,input[type=search],textarea{font:inherit;border:1px solid #bcc5bd;border-radius:9px;background:#fff;color:var(--ink);padding:9px 11px}.count{margin-left:auto;color:var(--muted);font-weight:650}.candidate{margin:18px 0;overflow:hidden}.candidate>header{padding:16px 18px;background:#eef1ed;border-bottom:1px solid var(--line)}.candidate>header h2{margin:0}.candidate>header p{color:var(--muted)}.item{padding:18px;border-top:1px solid var(--line)}.item:first-of-type{border-top:0}.item-top{display:flex;gap:10px;justify-content:space-between;align-items:flex-start}.cnj{font-weight:800;font-variant-numeric:tabular-nums}.tag{display:inline-block;padding:3px 8px;border-radius:999px;background:#edf0ed;color:#445248;font-size:12px;font-weight:750}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.facts div{padding:9px;background:#f7f8f6;border-radius:9px}.facts b{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.reason{padding:12px 14px;background:#fbfaf6;border-left:4px solid var(--amber);margin:12px 0}.choices{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.choice{display:flex;gap:9px;align-items:flex-start;padding:12px;border:1px solid var(--line);border-radius:11px;cursor:pointer;background:#fff}.choice:has(input:checked){border:2px solid var(--blue);padding:11px;background:#f2f8fb}.choice span{display:block}.choice small{display:block;color:var(--muted)}a{color:#075f8a}.empty{background:#fff;padding:30px;border:1px solid var(--line);border-radius:14px}.apply{margin-top:28px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px}.apply textarea{width:100%;min-height:95px}.apply button{margin-top:12px;border:0;border-radius:10px;background:#165f41;color:#fff;font-weight:800;padding:13px 18px;font-size:16px;cursor:pointer}.apply button:disabled{opacity:.55}.status{margin-top:10px;font-weight:700}.fine{font-size:13px;color:var(--muted)}
@media(max-width:800px){.rubrica,.summary,.facts,.choices{grid-template-columns:1fr}.toolbar{position:static}.count{width:100%;margin:0}}
</style>
</head>
<body><main>
<p class="tag">Puxa Ficha · decisão editorial assistida</p>
<h1>O processo e o ponto de atenção seguem réguas diferentes.</h1>
<p class="lede">Um processo atribuível não desaparece só porque é privado. Já um ponto de atenção exige interesse público e contexto suficiente para não transformar um registro judicial em acusação.</p>
<section class="notice"><strong>Este botão não publica processos.</strong><p>Ele salva suas decisões para a próxima etapa de revisão e implementação. Nenhuma ficha e nenhum dado do Supabase será alterado por esta página.</p></section>
<section class="rubrica" aria-label="Criterios editoriais">
<article><strong>Publicar em Processos</strong><p>Identidade, papel pessoal ou ato direto no cargo, natureza do caso, estado oficial e família processual estão claros. O desfecho favorável aparece com o mesmo destaque.</p></article>
<article><strong>Criar ponto de atenção</strong><p>Há um padrão material de interesse público, campanha ou gestão, mas os CNJs devem sustentar um texto agregado e neutro, não dezenas de acusações pessoais.</p></article>
<article><strong>Excluir da ficha</strong><p>Homônimo, terceiro, autor ou vítima, autoridade apenas nominal, duplicata real ou caso sem vínculo material com a pessoa.</p></article>
<article><strong>Pesquisar mais</strong><p>Quando falta provar o papel da pessoa, o assunto, a fase atual, a relevância ou a relação com outro processo. Erro, captcha ou ambiguidade nunca viram ausência.</p></article>
</section>
<section class="summary">
<div class="metric pub"><span>Recomendados para publicar</span><b>${resumo.publicar}</b><small>sempre passam pela fila editorial</small></div>
<div class="metric point"><span>Base para pontos de atenção</span><b>${resumo.ponto_atencao}</b><small>${gruposPonto} textos agregados, não ${resumo.ponto_atencao} acusações</small></div>
<div class="metric no"><span>Descartes seguros</span><b>${resumo.nao_publicar}</b><small>fora da ficha por papel, identidade ou duplicidade</small></div>
<div class="metric more"><span>Precisam de pesquisa</span><b>${resumo.pesquisar_mais}</b><small>nenhuma conclusão será publicada</small></div>
</section>
<div class="toolbar">
  <div class="field"><label for="fRec">Recomendação</label><select id="fRec"><option value="">Todas</option><option value="publicar">Publicar em Processos</option><option value="ponto_atencao">Criar ponto de atenção</option><option value="nao_publicar">Excluir da ficha</option><option value="pesquisar_mais">Pesquisar mais</option></select></div>
  <div class="field"><label for="fCand">Candidato</label><select id="fCand"><option value="">Todos</option></select></div>
  <div class="field"><label for="fSearch">Buscar</label><input id="fSearch" type="search" placeholder="CNJ, classe, tribunal"></div>
  <div class="count" id="count"></div>
</div>
<div id="list"></div>
<section class="apply">
<h2>Registrar decisões</h2>
<p>As recomendações já estão marcadas. Altere apenas o que você quiser corrigir e acrescente uma orientação geral, se necessário.</p>
<label class="field" for="instructions"><span>Instrução adicional</span><textarea id="instructions" placeholder="Ex.: priorizar a pesquisa dos casos de improbidade; não publicar litígios privados."></textarea></label>
<button id="apply">Aplicar decisões para a próxima etapa</button>
<p class="status" id="status" role="status"></p>
</section>
<p class="fine">Regra de segurança: volume de CNJs, classe processual ou polo A/P não provam culpa, relevância nem estado atual.</p>
</main>
<script id="data" type="application/json">${dados}</script>
<script>
const data=JSON.parse(document.getElementById('data').textContent);
const state={choices:Object.fromEntries(data.itens.map(i=>[i.numero_cnj,i.recomendacao]))};
const label={publicar:'Publicar em Processos',ponto_atencao:'Criar ponto de atenção',nao_publicar:'Excluir da ficha',pesquisar_mais:'Pesquisar mais'};
const explanation={publicar:'Enviar o card para a fila editorial',ponto_atencao:'Usar como evidência de um texto agregado',nao_publicar:'Manter fora da ficha',pesquisar_mais:'Não concluir sem nova verificação'};
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const redact=s=>String(s??'').replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[CPF oculto]').slice(0,420);
const bySlug=new Map(data.itens.map(i=>[i.slug,i.nome_urna]));
document.getElementById('fCand').insertAdjacentHTML('beforeend',[...bySlug].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([s,n])=>'<option value="'+esc(s)+'">'+esc(n)+'</option>').join(''));
function render(){
 const rec=document.getElementById('fRec').value,cand=document.getElementById('fCand').value,q=document.getElementById('fSearch').value.toLowerCase();
 const visible=data.itens.filter(i=>(!rec||i.recomendacao===rec)&&(!cand||i.slug===cand)&&(!q||[i.numero_cnj,i.nome_urna,i.nome_completo,i.classe,i.tribunal,i.orgao].join(' ').toLowerCase().includes(q)));
 const groups=new Map(); for(const i of visible){if(!groups.has(i.slug))groups.set(i.slug,[]);groups.get(i.slug).push(i)}
 document.getElementById('count').textContent=visible.length+' de '+data.itens.length+' registros';
 document.getElementById('list').innerHTML=visible.length?[...groups].map(([slug,items])=>{
  const c=items[0]; return '<section class="candidate"><header><h2>'+esc(c.nome_urna)+'</h2><p>'+esc(c.nome_completo)+' · '+esc(c.cargo)+' · '+esc(c.uf)+' · '+esc(c.partido)+' · '+items.length+' registro(s) visíveis</p></header>'+items.map(itemHtml).join('')+'</section>'
 }).join(''):'<p class="empty">Nenhum item corresponde aos filtros.</p>';
 document.querySelectorAll('input[data-cnj]').forEach(input=>input.addEventListener('change',()=>{state.choices[input.dataset.cnj]=input.value}));
}
function itemHtml(i){return '<article class="item" data-cnj="'+esc(i.numero_cnj)+'"><div class="item-top"><div><div class="cnj">'+esc(i.numero_cnj)+'</div><div>'+esc(i.classe)+' · '+esc(i.tribunal)+'</div></div><span class="tag">Confiança '+esc(i.confianca)+'</span></div><div class="facts"><div><b>Vinculação</b>'+esc(i.vinculacao)+'</div><div><b>Polo bruto</b>'+esc(i.polo)+'</div><div><b>Relevância</b>'+esc(i.relevancia)+'</div><div><b>Duplicidade</b>'+(i.duplicidade?.duplicado?'Sim'+(i.duplicidade.grupo?' · '+esc(i.duplicidade.grupo):''):'Não identificada')+'</div></div><div class="reason"><b>Por que esta é a recomendação:</b><p>'+esc(i.motivo)+'</p></div><details><summary>Ver evidência e limites</summary><p><b>Trecho oficial de identidade:</b> '+esc(redact(i.contexto_identidade))+'</p><p><b>Conferência DataJud:</b> '+esc(i.datajud?.status||'não disponível')+(i.datajud?.motivo?' · '+esc(i.datajud.motivo):'')+'</p></details><p><a href="'+esc(i.fonte_oficial||i.url)+'" target="_blank" rel="noopener noreferrer">Abrir fonte oficial</a> · <span class="fine">'+esc(i.orgao)+'</span></p><div class="choices">'+['publicar','ponto_atencao','nao_publicar','pesquisar_mais'].map(v=>'<label class="choice"><input type="radio" data-cnj="'+esc(i.numero_cnj)+'" name="d-'+esc(i.numero_cnj)+'" value="'+v+'" '+(state.choices[i.numero_cnj]===v?'checked':'')+'><span><b>'+label[v]+(i.recomendacao===v?' · Recomendado':'')+'</b><small>'+explanation[v]+'</small></span></label>').join('')+'</div></article>'}
['fRec','fCand','fSearch'].forEach(id=>document.getElementById(id).addEventListener(id==='fSearch'?'input':'change',render));
document.getElementById('apply').addEventListener('click',async()=>{const btn=document.getElementById('apply'),status=document.getElementById('status');btn.disabled=true;status.textContent='Registrando...';const payload={tipo:'decisoes_editoriais_processos',gerado_em:new Date().toISOString(),instrucoes:document.getElementById('instructions').value,decisoes:data.itens.map(i=>({slug:i.slug,nome_urna:i.nome_urna,numero_cnj:i.numero_cnj,recomendacao_original:i.recomendacao,decisao:state.choices[i.numero_cnj]}))};try{const r=await fetch('/aplicar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error('HTTP '+r.status);status.textContent='Decisões registradas. Nenhuma ficha foi publicada.'}catch(e){status.textContent='Não foi possível registrar: '+e.message;btn.disabled=false}});
render();
</script></body></html>`;
}

function main(): void {
  const evidencia = lerJson(arg("evidencia")) as { lotes?: Array<{ candidatos?: Candidato[] }> };
  const caminhosTriagem = arg("triagem").split(",");
  const triagens = caminhosTriagem.flatMap((caminho) => itensTriagem(lerJson(caminho)));
  validarTriagem(triagens);

  const candidatos = (evidencia.lotes ?? []).flatMap((lote) => lote.candidatos ?? []);
  const processos = candidatos.flatMap((candidato) =>
    (candidato.processos ?? []).map((processo) => ({ candidato, processo })),
  );
  const porCnj = new Map(processos.map((item) => [item.processo.numero_cnj, item]));
  if (processos.length !== porCnj.size) {
    throw new Error(`Evidencia invalida: ${processos.length - porCnj.size} CNJ(s) repetido(s)`);
  }
  for (const { processo } of processos) {
    const urls = [processo.url].filter(Boolean);
    if (urls.some((url) => new URL(url).protocol !== "https:")) {
      throw new Error(`Fonte oficial sem HTTPS: ${processo.numero_cnj}`);
    }
  }
  const cnjsEvidencia = new Set(porCnj.keys());
  const cnjsTriagem = new Set(triagens.map((item) => item.numero_cnj));
  const faltantes = [...cnjsEvidencia].filter((cnj) => !cnjsTriagem.has(cnj));
  const extras = [...cnjsTriagem].filter((cnj) => !cnjsEvidencia.has(cnj));
  if (faltantes.length || extras.length) {
    throw new Error(`Cobertura invalida: ${faltantes.length} CNJs faltantes; ${extras.length} extras`);
  }

  const itens: ReviewItem[] = triagens.map((triagem) => {
    const base = porCnj.get(triagem.numero_cnj)!;
    if (triagem.slug !== base.candidato.slug) {
      throw new Error(`Associacao CNJ/slug divergente: ${triagem.numero_cnj}`);
    }
    if (triagem.fonte_oficial && new URL(triagem.fonte_oficial).protocol !== "https:") {
      throw new Error(`Fonte da triagem sem HTTPS: ${triagem.numero_cnj}`);
    }
    return {
      ...base.processo,
      ...triagem,
      nome_urna: base.candidato.nome_urna,
      nome_completo: base.candidato.nome_completo,
      cargo: base.candidato.cargo,
      uf: base.candidato.uf,
      partido: base.candidato.partido,
    };
  }).sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR") || a.numero_cnj.localeCompare(b.numero_cnj));

  const resumo = { publicar: 0, ponto_atencao: 0, nao_publicar: 0, pesquisar_mais: 0 } satisfies Record<Recomendacao, number>;
  for (const item of itens) resumo[item.recomendacao] += 1;
  const saidaJson = arg("json");
  const saidaHtml = arg("out");
  mkdirSync(dirname(saidaJson), { recursive: true });
  mkdirSync(dirname(saidaHtml), { recursive: true });
  writeFileSync(saidaJson, `${JSON.stringify({ schema_version: 1, gerado_em: new Date().toISOString(), resumo, itens }, null, 2)}\n`);
  writeFileSync(saidaHtml, html(itens, resumo));
  console.log(JSON.stringify({ html: saidaHtml, json: saidaJson, itens: itens.length, resumo }));
}

main();
