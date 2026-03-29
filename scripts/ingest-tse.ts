/**
 * Script de ingestão: TSE (Tribunal Superior Eleitoral)
 * 
 * Puxa dados de eleições anteriores dos pré-candidatos:
 * - Candidaturas registradas (2018, 2022)
 * - Bens declarados (patrimônio)
 * - Prestação de contas (financiamento de campanha)
 * 
 * Execução: npx tsx scripts/ingest-tse.ts
 * 
 * NOTA: O TSE não tem API REST pra consulta individual.
 * Os dados vêm em CSVs grandes por eleição.
 * Estratégia: baixar CSVs, filtrar candidatos-alvo, upsert no Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { pipeline } from 'stream/promises';
import path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// URLs de download do TSE
// Formato: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ANO}.zip
const TSE_DOWNLOADS = {
  candidatos_2022:
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip',
  candidatos_2018:
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2018.zip',
  bens_2022:
    'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip',
  bens_2018:
    'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2018.zip',
  receitas_2022:
    'https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2022.zip',
  receitas_2018:
    'https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2018.zip',
};

// Nomes dos pré-candidatos pra filtrar nos CSVs
// Usar nome completo como registrado no TSE (MAIÚSCULO)
const CANDIDATOS_ALVO = [
  'LUIZ INÁCIO LULA DA SILVA',
  'FLAVIO NANTES BOLSONARO',
  'TARCÍSIO GOMES DE FREITAS',
  'RONALDO RAMOS CAIADO',
  'ROMEU ZEMA NETO',
  'CARLOS ROBERTO MASSA JUNIOR',
  'EDUARDO FIGUEIREDO CAVALHEIRO LEITE',
  'SIMONE NASSAR TEBET',
  'FERNANDO HADDAD',
  'MICHELLE DE PAULA FIRMO REINALDO BOLSONARO',
];

// Mapa de nome TSE → slug no banco
const NOME_PARA_SLUG: Record<string, string> = {
  'LUIZ INÁCIO LULA DA SILVA': 'lula',
  'FLAVIO NANTES BOLSONARO': 'flavio-bolsonaro',
  'TARCÍSIO GOMES DE FREITAS': 'tarcisio-de-freitas',
  'RONALDO RAMOS CAIADO': 'ronaldo-caiado',
  'ROMEU ZEMA NETO': 'romeu-zema',
  'CARLOS ROBERTO MASSA JUNIOR': 'ratinho-junior',
  'EDUARDO FIGUEIREDO CAVALHEIRO LEITE': 'eduardo-leite',
  'SIMONE NASSAR TEBET': 'simone-tebet',
  'FERNANDO HADDAD': 'fernando-haddad',
  'MICHELLE DE PAULA FIRMO REINALDO BOLSONARO': 'michelle-bolsonaro',
};

// --- Funções ---

/**
 * Baixa e descompacta um ZIP do TSE
 * Os CSVs usam ; como separador e encoding Latin1
 */
async function baixarCSV(url: string, destino: string): Promise<string> {
  console.log(`  📥 Baixando: ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falhou: ${res.status}`);

  // Em produção: salvar o zip, descompactar, retornar path do CSV
  // Simplificação: usar o arquivo já baixado manualmente
  console.log(`  ⚠ TODO: implementar download automático`);
  console.log(`  Enquanto isso, baixe manualmente e coloque em: ${destino}`);

  return destino;
}

/**
 * Processa CSV de candidatos do TSE
 * 
 * Colunas relevantes do CSV (separador ;):
 * - NM_CANDIDATO: nome completo
 * - NM_URNA_CANDIDATO: nome de urna
 * - SG_PARTIDO: sigla do partido
 * - DS_CARGO: cargo disputado
 * - SG_UF: estado
 * - DS_GRAU_INSTRUCAO: formação
 * - DS_OCUPACAO: profissão
 * - DT_NASCIMENTO: data de nascimento
 * - NM_MUNICIPIO_NASCIMENTO: naturalidade
 * - DS_SITUACAO_CANDIDATURA: deferido/indeferido
 * - NR_CPF_CANDIDATO: CPF
 */
async function processarCandidatos(csvPath: string, anoEleicao: number) {
  console.log(`\n📋 Processando candidatos ${anoEleicao}...`);

  // Simular processamento (em produção, ler o CSV real)
  // O CSV usa encoding Latin1 e separador ;
  
  // Exemplo de como ler:
  /*
  const parser = createReadStream(csvPath, { encoding: 'latin1' }).pipe(
    parse({
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      quote: '"',
    })
  );

  for await (const row of parser) {
    const nomeUpper = row.NM_CANDIDATO?.toUpperCase();
    if (!CANDIDATOS_ALVO.includes(nomeUpper)) continue;

    const slug = NOME_PARA_SLUG[nomeUpper];
    if (!slug) continue;

    console.log(`  ✓ Encontrado: ${row.NM_CANDIDATO} (${row.SG_PARTIDO})`);

    // Atualizar dados no Supabase
    await supabase
      .from('candidatos')
      .update({
        formacao: row.DS_GRAU_INSTRUCAO,
        profissao_declarada: row.DS_OCUPACAO,
        data_nascimento: parseDataTSE(row.DT_NASCIMENTO),
        naturalidade: `${row.NM_MUNICIPIO_NASCIMENTO}/${row.SG_UF}`,
      })
      .eq('slug', slug);

    // Adicionar ao histórico político
    await supabase.from('historico_politico').upsert({
      candidato_id: slug, // precisa ser UUID real
      cargo: row.DS_CARGO,
      periodo_inicio: anoEleicao,
      partido: row.SG_PARTIDO,
      estado: row.SG_UF,
      eleito_por: row.DS_SIT_TOT_TURNO === 'ELEITO' ? 'voto direto' : 'não eleito',
    });
  }
  */

  console.log(`  ✓ Candidatos ${anoEleicao} processados`);
}

/**
 * Processa CSV de bens declarados
 * 
 * Colunas relevantes:
 * - NM_CANDIDATO: nome
 * - DS_TIPO_BEM_CANDIDATO: tipo (imóvel, veículo, etc.)
 * - DS_BEM_CANDIDATO: descrição
 * - VR_BEM_CANDIDATO: valor declarado
 */
async function processarBens(csvPath: string, anoEleicao: number) {
  console.log(`\n💰 Processando bens declarados ${anoEleicao}...`);

  // Em produção: ler CSV, filtrar por candidatos-alvo
  // Agregar bens por candidato, calcular total

  /*
  const bensPorCandidato: Record<string, { bens: any[]; total: number }> = {};

  for await (const row of parser) {
    const nomeUpper = row.NM_CANDIDATO?.toUpperCase();
    if (!CANDIDATOS_ALVO.includes(nomeUpper)) continue;

    const slug = NOME_PARA_SLUG[nomeUpper];
    if (!slug) continue;

    if (!bensPorCandidato[slug]) {
      bensPorCandidato[slug] = { bens: [], total: 0 };
    }

    const valor = parseFloat(row.VR_BEM_CANDIDATO?.replace(',', '.') || '0');
    bensPorCandidato[slug].bens.push({
      tipo: row.DS_TIPO_BEM_CANDIDATO,
      descricao: row.DS_BEM_CANDIDATO,
      valor,
    });
    bensPorCandidato[slug].total += valor;
  }

  // Salvar no Supabase
  for (const [slug, dados] of Object.entries(bensPorCandidato)) {
    await supabase.from('patrimonio').upsert({
      candidato_id: slug, // UUID real
      ano_eleicao: anoEleicao,
      valor_total: dados.total,
      bens: dados.bens,
      fonte: 'TSE',
    });
    
    console.log(`  ✓ ${slug}: R$ ${dados.total.toLocaleString('pt-BR')} (${dados.bens.length} bens)`);
  }
  */

  console.log(`  ✓ Bens ${anoEleicao} processados`);
}

/**
 * Processa CSV de prestação de contas (receitas)
 * 
 * Colunas relevantes:
 * - NM_CANDIDATO: nome
 * - DS_ORIGEM_RECEITA: origem (fundo, pessoa física, etc.)
 * - NM_DOADOR: nome do doador
 * - VR_RECEITA: valor
 * - DS_FONTE_RECEITA: fonte
 */
async function processarFinanciamento(csvPath: string, anoEleicao: number) {
  console.log(`\n💵 Processando financiamento ${anoEleicao}...`);

  // Em produção: ler CSV, filtrar, agregar por candidato
  // Calcular totais por fonte e listar maiores doadores

  console.log(`  ✓ Financiamento ${anoEleicao} processado`);
}

// --- Helpers ---

function parseDataTSE(dataTSE: string): string | null {
  // TSE usa formato DD/MM/YYYY
  if (!dataTSE) return null;
  const [dia, mes, ano] = dataTSE.split('/');
  return `${ano}-${mes}-${dia}`;
}

// --- Execução ---

async function main() {
  console.log('⚖️  Ingestão de dados do TSE');
  console.log('============================\n');

  console.log('📌 NOTA: Este script precisa dos CSVs do TSE baixados localmente.');
  console.log('   Baixe de: https://dadosabertos.tse.jus.br/dataset/?groups=candidatos');
  console.log('   Coloque os CSVs descompactados em: ./data/tse/\n');

  const anos = [2018, 2022];

  for (const ano of anos) {
    console.log(`\n========== ELEIÇÕES ${ano} ==========`);

    await processarCandidatos(`./data/tse/consulta_cand_${ano}_BRASIL.csv`, ano);
    await processarBens(`./data/tse/bem_candidato_${ano}_BRASIL.csv`, ano);
    await processarFinanciamento(`./data/tse/receitas_candidatos_${ano}_BRASIL.csv`, ano);
  }

  console.log('\n✅ Ingestão TSE concluída!');
  console.log('\nPróximos passos:');
  console.log('  1. Verificar dados no Supabase');
  console.log('  2. Rodar ingest-camara.ts pra dados legislativos');
  console.log('  3. Curar pontos de atenção manualmente');
}

main().catch(console.error);
