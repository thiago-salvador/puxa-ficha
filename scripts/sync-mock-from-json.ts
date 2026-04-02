/**
 * Reads candidatos.json and generates mock entries for all governors
 * that are not yet in mock.ts. Outputs the TypeScript code to paste.
 *
 * Usage: npx tsx scripts/sync-mock-from-json.ts
 */
import fs from "fs"
import path from "path"

interface CandidatoJSON {
  slug: string
  nome_completo: string
  nome_urna: string
  cargo_disputado: string
  estado?: string
  ids: { camara: number | null; senado: number | null; tse_sq_candidato: Record<string, unknown> }
}

const jsonPath = path.resolve(__dirname, "../data/candidatos.json")
const candidates: CandidatoJSON[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))

// Filter only governors not in the Sul/SP set (IDs 14-40 already in mock)
const existingSlugs = new Set([
  // Presidential (1-13)
  "lula", "flavio-bolsonaro", "tarcisio", "romeu-zema", "ronaldo-caiado",
  "ratinho-junior", "aldo-rebelo", "renan-santos", "ciro-gomes", "hertz-dias",
  "eduardo-leite", "rui-costa-pimenta", "samara-martins",
  // SP governors (14-23)
  "tarcisio-gov-sp", "haddad-gov-sp", "erika-hilton", "felicio-ramuth",
  "ricardo-nunes", "geraldo-alckmin", "gilberto-kassab", "andre-do-prado",
  "marcio-franca", "guilherme-derrite",
  // Sul governors (24-40)
  "sergio-moro-gov-pr", "guto-silva", "alexandre-curi", "rafael-greca",
  "requiao-filho", "paulo-martins-gov-pr", "jorginho-mello", "joao-rodrigues",
  "decio-lima", "marcos-vieira", "marcelo-brigadeiro", "luciano-zucco",
  "juliana-brizola", "edegar-pretto", "gabriel-souza", "marcelo-maranata",
  "evandro-augusto",
])

const newGovs = candidates.filter(
  (c) => c.cargo_disputado === "Governador" && !existingSlugs.has(c.slug)
)

// Partido lookup (from research data)
const PARTIDO_MAP: Record<string, { sigla: string; nome: string }> = {
  "eduardo-paes": { sigla: "PSD", nome: "Partido Social Democratico" },
  "douglas-ruas": { sigla: "PL", nome: "Partido Liberal" },
  "rodrigo-bacellar": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "washington-reis": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "garotinho": { sigla: "REPUBLICANOS", nome: "Republicanos" },
  "tarcisio-motta": { sigla: "PSOL", nome: "Partido Socialismo e Liberdade" },
  "cleitinho": { sigla: "REPUBLICANOS", nome: "Republicanos" },
  "nikolas-ferreira": { sigla: "PL", nome: "Partido Liberal" },
  "mateus-simoes": { sigla: "PSD", nome: "Partido Social Democratico" },
  "rodrigo-pacheco": { sigla: "PSD", nome: "Partido Social Democratico" },
  "gabriel-azevedo": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "maria-da-consolacao": { sigla: "PSOL", nome: "Partido Socialismo e Liberdade" },
  "pazolini": { sigla: "REPUBLICANOS", nome: "Republicanos" },
  "ricardo-ferraco": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "paulo-hartung": { sigla: "PSD", nome: "Partido Social Democratico" },
  "sergio-vidigal": { sigla: "PDT", nome: "Partido Democratico Trabalhista" },
  "arnaldinho-borgo": { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira" },
  "helder-salomao": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "da-vitoria": { sigla: "PP", nome: "Progressistas" },
  "jeronimo": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "acm-neto": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "joao-roma": { sigla: "PL", nome: "Partido Liberal" },
  "jose-carlos-aleluia": { sigla: "NOVO", nome: "Partido Novo" },
  "ronaldo-mansur": { sigla: "PSOL", nome: "Partido Socialismo e Liberdade" },
  "elmano-de-freitas": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "ciro-gomes-gov-ce": { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira" },
  "roberto-claudio": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "eduardo-girao": { sigla: "NOVO", nome: "Partido Novo" },
  "capitao-wagner": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "eduardo-braide": { sigla: "PSD", nome: "Partido Social Democratico" },
  "orleans-brandao": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "felipe-camarao": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "lahesio-bonfim": { sigla: "NOVO", nome: "Partido Novo" },
  "enilton-rodrigues": { sigla: "PSOL", nome: "Partido Socialismo e Liberdade" },
  "joao-campos": { sigla: "PSB", nome: "Partido Socialista Brasileiro" },
  "raquel-lyra": { sigla: "PSD", nome: "Partido Social Democratico" },
  "gilson-machado": { sigla: "PL", nome: "Partido Liberal" },
  "anderson-ferreira": { sigla: "PL", nome: "Partido Liberal" },
  "ivan-moraes": { sigla: "PSOL", nome: "Partido Socialismo e Liberdade" },
  "cicero-lucena": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "lucas-ribeiro": { sigla: "PP", nome: "Progressistas" },
  "efraim-filho": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "pedro-cunha-lima": { sigla: "PSD", nome: "Partido Social Democratico" },
  "rafael-fonteles": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "silvio-mendes": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "joel-rodrigues": { sigla: "PP", nome: "Progressistas" },
  "margarete-coelho": { sigla: "PP", nome: "Progressistas" },
  "alysson-bezerra": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "alvaro-dias-rn": { sigla: "REPUBLICANOS", nome: "Republicanos" },
  "cadu-xavier": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "fabio-mitidieri": { sigla: "PSD", nome: "Partido Social Democratico" },
  "valmir-de-francisquinho": { sigla: "PL", nome: "Partido Liberal" },
  "thiago-de-joaldo": { sigla: "PP", nome: "Progressistas" },
  "jhc": { sigla: "PL", nome: "Partido Liberal" },
  "renan-filho": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "alan-rick": { sigla: "REPUBLICANOS", nome: "Republicanos" },
  "mailza-assis": { sigla: "PP", nome: "Progressistas" },
  "tiao-bocalom": { sigla: "PL", nome: "Partido Liberal" },
  "andre-kamai": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "omar-aziz": { sigla: "PSD", nome: "Partido Social Democratico" },
  "maria-do-carmo": { sigla: "PL", nome: "Partido Liberal" },
  "tadeu-de-souza": { sigla: "PP", nome: "Progressistas" },
  "david-almeida": { sigla: "AVANTE", nome: "Avante" },
  "eduardo-braga": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "dr-furlan": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "clecio-luis": { sigla: "SOLIDARIEDADE", nome: "Solidariedade" },
  "joao-capiberibe": { sigla: "PSB", nome: "Partido Socialista Brasileiro" },
  "hana-ghassan": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "dr-daniel": { sigla: "PSB", nome: "Partido Socialista Brasileiro" },
  "delegado-eder-mauro": { sigla: "PL", nome: "Partido Liberal" },
  "beto-faro": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "simao-jatene": { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira" },
  "marcos-rogerio": { sigla: "PL", nome: "Partido Liberal" },
  "adailton-furia": { sigla: "PSD", nome: "Partido Social Democratico" },
  "hildon-chaves": { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira" },
  "dr-fernando-maximo": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "confucio-moura": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "expedito-netto": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "arthur-henrique": { sigla: "PL", nome: "Partido Liberal" },
  "edilson-damiao": { sigla: "PP", nome: "Progressistas" },
  "teresa-surita": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "soldado-sampaio": { sigla: "PL", nome: "Partido Liberal" },
  "professora-dorinha": { sigla: "UNIAO", nome: "Uniao Brasil" },
  "laurez-moreira": { sigla: "PSD", nome: "Partido Social Democratico" },
  "amelio-cayres": { sigla: "REPUBLICANOS", nome: "Republicanos" },
  "vicentinho-junior": { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira" },
  "ataides-oliveira": { sigla: "NOVO", nome: "Partido Novo" },
  "celina-leao": { sigla: "PP", nome: "Progressistas" },
  "leandro-grass": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "ricardo-cappelli": { sigla: "PSB", nome: "Partido Socialista Brasileiro" },
  "paula-belmonte": { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira" },
  "daniel-vilela": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "marconi-perillo": { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira" },
  "adriana-accorsi": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "wilder-morais": { sigla: "PL", nome: "Partido Liberal" },
  "jose-eliton": { sigla: "PSB", nome: "Partido Socialista Brasileiro" },
  "eduardo-riedel": { sigla: "PP", nome: "Progressistas" },
  "fabio-trad": { sigla: "PT", nome: "Partido dos Trabalhadores" },
  "joao-henrique-catan": { sigla: "PL", nome: "Partido Liberal" },
  "lucien-rezende": { sigla: "PSOL", nome: "Partido Socialismo e Liberdade" },
  "otaviano-pivetta": { sigla: "REPUBLICANOS", nome: "Republicanos" },
  "wellington-fagundes": { sigla: "PL", nome: "Partido Liberal" },
  "janaina-riva": { sigla: "MDB", nome: "Movimento Democratico Brasileiro" },
  "natasha-slhessarenko": { sigla: "PSD", nome: "Partido Social Democratico" },
}

let nextId = 41
const lines: string[] = []

for (const c of newGovs) {
  const partido = PARTIDO_MAP[c.slug] ?? { sigla: "?", nome: "?" }
  lines.push(`  {
    id: "${nextId}", nome_completo: "${c.nome_completo}", nome_urna: "${c.nome_urna}", slug: "${c.slug}",
    data_nascimento: null, idade: null, naturalidade: null, formacao: null, profissao_declarada: null,
    partido_atual: "${partido.nome}", partido_sigla: "${partido.sigla}", cargo_atual: null, cargo_disputado: "Governador", estado: "${c.estado}",
    status: "pre-candidato", biografia: null, foto_url: null, site_campanha: null, redes_sociais: {},
    fonte_dados: ["curadoria"], ultima_atualizacao: "2026-03-30",
  },`)
  nextId++
}

console.log(`// === NEW GOVERNORS (${newGovs.length} entries, IDs 41-${nextId - 1}) ===`)
console.log(lines.join("\n"))
console.log(`\n// Total: ${nextId - 1} candidates in mock`)
