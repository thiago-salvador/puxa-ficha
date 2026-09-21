# Issue #388: chave de `cpf_hash` perdida e reparo com chave versionada

## Resultado

Reparo aplicado em produção em 2026-09-21. A chave antiga de
`PF_DOADOR_CPF_HASH_SALT` (versão 1) não foi recuperada e não é mais
necessária: os 690 hashes vivos foram reescritos com uma chave nova (versão 2),
cada doador marcado com `cpf_hash_versao: 2`, e nenhum hash v1 resta na tabela
viva.

| Medida | Antes | Depois |
|---|---|---|
| Linhas em `financiamento` | 2.039 | 2.034 |
| Linhas com `cpf_hash` | 108 | 103 |
| Hashes de doador | 704 (v1) | 690 (v2) |
| Linhas com hash sem SQ ou UF | 108 | 0 |
| Linhas movidas para `financiamento_quarentena` | 0 | 5 |
| Campo sensível no payload público | 0 | 0 |

## Estado de partida

- 2.039 linhas em `financiamento`, 704 `cpf_hash` em 108 linhas, todas com
  `sq_candidato` e `uf_candidatura` vazios.
- O hash é `SHA-256(chave + ":" + CPF)`. A chave v1 não estava em `.env.local`,
  secrets do GitHub, variáveis da Vercel nem no histórico. Gerar chave
  compatível é impossível.

## Passo 1: ponte de identidade

Identidade aceita só por SQ oficial validado por nome, UF, cargo e contexto
eleitoral, ou por CPF exato. Nunca por nome isolado.

| Situação | Contextos | Hashes |
|---|---|---|
| Resolvidos por SQ oficial validado ou CPF exato | 103 | 690 |
| Atribuição removida (sem candidatura oficial no ano) | 5 | 14 |
| **Total** | **108** | **704** |

Os cinco sem candidatura oficial no ano do contexto, nem por CPF nem por nome
completo: silvio-mendes 2016 PI, joao-roma 2020 BA, paulo-serra 2018 SP,
paulo-martins-gov-pr 2016 PR e cleitinho 2024 MG. O ano da linha vem do pacote
de receitas ingerido, não do cadastro, então o defeito era a atribuição e não o
ano. As linhas foram movidas para `financiamento_quarentena` com o motivo
registrado; reverter é devolver a linha da quarentena.

jose-eliton 2018 GO (SQ 90000609446, governador) e rodrigo-pacheco 2018 MG (SQ
130000604556, senador) foram aceitos por SQ oficial validado. No segundo caso o
CPF do cadastro divergia do CPF da linha oficial do SQ, e o cadastro foi
corrigido pelo CPF oficial.

## Passo 2: reprodução a partir das fontes oficiais

Fontes: os 8 pacotes de receitas de 2010 a 2024 já em cache, sem download novo;
20.459.846 linhas lidas. A reconstrução usa os módulos do próprio projeto
(`normalizeFinanciamentoReceitaRow`, `financiamentoReceitaDedupKey`,
`normalizeMaioresDoadoresForStorage`) com o CPF injetado no lugar do hash, para
que a agregação decida exatamente como o ingest.

| Doadores com `cpf_hash` nos 103 contextos | Resultado |
|---|---|
| Nome confere com a fonte oficial | 690 / 690 |
| Valor confere (tolerância de 1 centavo) | 690 / 690 |
| CPF único recuperado na fonte oficial | 690 / 690 |

Limite conhecido: com a chave v1 perdida, o valor do hash antigo não é
verificável por igualdade. O que ficou provado é identidade e posição: mesma
pessoa, mesmo valor, hash presente exatamente onde a fonte oficial dá um CPF
único.

Achado lateral, fora do escopo do reparo: em 31 dos 103 contextos a lista
gravada de doadores **sem** hash difere da agregação atual (doador gravado como
`#NULO`, valores de diretórios partidários e troca de um nome na fronteira dos
10 maiores). As linhas gravadas são anteriores à normalização atual. O reparo
não toca esses doadores.

## Passos 3 a 8: backup, chave, versionamento e aplicação

1. **Backup cifrado** de `financiamento` (2.039 linhas) e
   `financiamento_verificacoes` (1.795 linhas), AES-256-CBC com PBKDF2, conferido
   por roundtrip de SHA-256. Guardado fora do repositório.
2. **Chave v2** gerada por fonte criptográfica, gravada só no `.env.local` do
   ingest local e no secret de repositório `PF_DOADOR_CPF_HASH_SALT`. O job
   "Ingestão TSE" de `.github/workflows/ingest.yml` passa a receber o secret.
   O runtime do site não usa a chave.
3. **Versionamento:** `DONOR_CPF_HASH_VERSION = 2` em
   `src/lib/financiamento-doador-identifiers.ts`; `cpf_hash_versao` gravado pelo
   ingest e preservado pela agregação por nome. Hash sem versão é v1.
4. **Dry-run determinístico:** plano conferido contra o backup cifrado linha a
   linha e recalculado no apply; o apply aborta se o plano recalculado diferir.
5. **Aplicação com CAS:** estado vivo conferido contra o plano antes da primeira
   escrita e de novo antes de cada linha; cada UPDATE filtra pelo estado
   anterior (`sq_candidato` vazio). Trilha em `coleta_log` via
   `escreverAuditado`: 104 escritas em `financiamento`, 1 em
   `financiamento_quarentena`, 1 em `candidatos`. Nenhuma compensação acionada.

## Passos 9 e 10: readback

Banco, por SQL agregado:

- 103 linhas com hash, 690 hashes, 690 em v2, 0 malformados.
- 0 linhas com hash sem SQ ou UF; UFs gravadas conferem com a ponte (inclui
  duas candidaturas nacionais com UF `BR`).
- 5 linhas na quarentena com o motivo da issue; 0 delas na tabela viva.
- CPF do cadastro corrigido confere com o CPF oficial do SQ, no formato de 11
  dígitos.

Superfície pública:

- Chave anon recebe 401 em `financiamento` e em `candidatos`.
- View `financiamento_publico` lida com a chave anon: 1.760 linhas, campos de
  doador expostos somente `nome`, `tipo` e `valor`; 0 ocorrências de
  `cpf_hash`, `cpf_hash_versao` ou `cpf`.
- `maiores_doadores_publicos` é montado por whitelist dos mesmos três campos.
- 12 perfis publicados amostrados em `/api/candidato-profile/[slug]`: nenhum
  campo sensível. Nenhum dos 54 candidatos reparados está entre os 514 perfis
  publicados.

## Pendência que depende de merge

A ligação do secret no workflow de ingest e o versionamento no código estão
nesta branch. Até o merge, um disparo manual do ingest TSE a partir da `main`
roda sem a chave e regrava os doadores sem `cpf_hash`. O ingest TSE não tem
agendamento, só disparo manual.
