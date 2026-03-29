/**
 * Script de ingestão: API da Câmara dos Deputados
 * 
 * Puxa dados de deputados que são pré-candidatos a presidente ou governador.
 * Execução: npx tsx scripts/ingest-camara.ts
 * 
 * O que faz:
 * 1. Busca perfil do deputado na API
 * 2. Puxa despesas (cota parlamentar)
 * 3. Puxa votações
 * 4. Puxa proposições de autoria
 * 5. Salva no Supabase
 */

import { createClient } from '@supabase/supabase-js';

// --- Config ---
const CAMARA_API = 'https://dadosabertos.camara.leg.br/api/v2';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Pré-candidatos que são/foram deputados
// IDs da API da Câmara (buscar em /deputados?nome=XXX)
const DEPUTADOS_ALVO: Record<string, string> = {
  // slug do candidato → ID na API da Câmara
  // Preencher com IDs reais após busca
  // Exemplo: 'flavio-bolsonaro': '178957' (Flávio foi deputado estadual, não federal)
  // Ajustar conforme necessário
};

// --- Funções de API ---

async function fetchCamara(endpoint: string) {
  const url = `${CAMARA_API}${endpoint}`;
  console.log(`  → GET ${url}`);

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Câmara API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.dados;
}

// --- Buscar deputado por nome ---
async function buscarDeputado(nome: string) {
  const dados = await fetchCamara(
    `/deputados?nome=${encodeURIComponent(nome)}&ordem=ASC&ordenarPor=nome`
  );

  if (!dados || dados.length === 0) {
    console.log(`  ⚠ Deputado não encontrado: ${nome}`);
    return null;
  }

  // Retorna o mais recente (pode ter múltiplos mandatos)
  return dados[0];
}

// --- Perfil completo ---
async function getPerfilDeputado(id: string) {
  return await fetchCamara(`/deputados/${id}`);
}

// --- Despesas (cota parlamentar) ---
async function getDespesas(id: string, ano: number) {
  const dados = await fetchCamara(
    `/deputados/${id}/despesas?ano=${ano}&itens=100&ordem=DESC&ordenarPor=dataDocumento`
  );
  return dados || [];
}

// --- Votações ---
async function getVotacoes(id: string) {
  const dados = await fetchCamara(`/deputados/${id}/votacoes?ordem=DESC&ordenarPor=dataHoraRegistro&itens=100`);
  return dados || [];
}

// --- Proposições de autoria ---
async function getProposicoes(id: string) {
  const dados = await fetchCamara(
    `/proposicoes?idDeputadoAutor=${id}&ordem=DESC&ordenarPor=id&itens=50`
  );
  return dados || [];
}

// --- Frentes parlamentares ---
async function getFrentes(id: string) {
  const dados = await fetchCamara(`/deputados/${id}/frentes`);
  return dados || [];
}

// --- Pipeline de ingestão ---

async function ingerirDeputado(slug: string, idCamara: string) {
  console.log(`\n=== Ingerindo: ${slug} (Câmara ID: ${idCamara}) ===`);

  // 1. Perfil
  const perfil = await getPerfilDeputado(idCamara);
  console.log(`  ✓ Perfil: ${perfil.nomeCivil}`);

  // 2. Despesas dos últimos 3 anos
  const anosRecentes = [2024, 2025, 2026];
  for (const ano of anosRecentes) {
    const despesas = await getDespesas(idCamara, ano);
    const total = despesas.reduce(
      (sum: number, d: any) => sum + (d.valorDocumento || 0),
      0
    );
    console.log(`  ✓ Despesas ${ano}: R$ ${total.toFixed(2)} (${despesas.length} registros)`);

    if (despesas.length > 0) {
      // Agrupar por tipo de despesa
      const porTipo: Record<string, number> = {};
      for (const d of despesas) {
        const tipo = d.tipoDespesa || 'Outros';
        porTipo[tipo] = (porTipo[tipo] || 0) + (d.valorDocumento || 0);
      }

      // Salvar no Supabase
      await supabase.from('gastos_parlamentares').upsert(
        {
          candidato_id: slug, // precisa converter pra UUID real
          ano,
          total_gasto: total,
          detalhamento: Object.entries(porTipo).map(([categoria, valor]) => ({
            categoria,
            valor,
          })),
          fonte: 'Câmara',
        },
        { onConflict: 'candidato_id,ano' }
      );
    }

    // Rate limiting gentil
    await sleep(500);
  }

  // 3. Votações recentes
  const votacoes = await getVotacoes(idCamara);
  console.log(`  ✓ Votações: ${votacoes.length} registros`);

  // 4. Proposições de autoria
  const proposicoes = await getProposicoes(idCamara);
  console.log(`  ✓ Proposições: ${proposicoes.length} registros`);

  for (const prop of proposicoes.slice(0, 20)) {
    // Top 20 mais recentes
    await supabase.from('projetos_lei').upsert(
      {
        candidato_id: slug,
        tipo: prop.siglaTipo,
        numero: String(prop.numero),
        ano: prop.ano,
        ementa: prop.ementa,
        situacao: prop.statusProposicao?.descricaoSituacao || 'desconhecida',
        url_inteiro_teor: prop.urlInteiroTeor || null,
        proposicao_id_api: String(prop.id),
        fonte: 'Câmara',
      },
      { onConflict: 'proposicao_id_api' }
    );
  }

  // 5. Frentes parlamentares
  const frentes = await getFrentes(idCamara);
  console.log(`  ✓ Frentes parlamentares: ${frentes.length}`);

  console.log(`=== Concluído: ${slug} ===\n`);
}

// --- Helpers ---

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Execução ---

async function main() {
  console.log('🏛 Ingestão de dados da Câmara dos Deputados');
  console.log('=============================================\n');

  // Primeiro, buscar IDs dos deputados que nos interessam
  const nomesParaBuscar = [
    'Flávio Bolsonaro',    // Foi dep. estadual RJ, depois senador
    'Simone Tebet',        // Senadora (usar API do Senado)
    'Fernando Haddad',     // Nunca foi deputado federal
    'Eduardo Leite',       // Nunca foi deputado federal
    // Adicionar outros conforme necessário
  ];

  console.log('Buscando deputados...\n');
  for (const nome of nomesParaBuscar) {
    const resultado = await buscarDeputado(nome);
    if (resultado) {
      console.log(`  ✓ ${nome}: ID ${resultado.id} (${resultado.siglaPartido}-${resultado.siglaUf})`);
    }
    await sleep(300);
  }

  // Depois, ingerir os que têm ID confirmado
  for (const [slug, id] of Object.entries(DEPUTADOS_ALVO)) {
    await ingerirDeputado(slug, id);
    await sleep(1000); // 1 segundo entre candidatos
  }

  console.log('\n✅ Ingestão concluída!');
}

main().catch(console.error);
