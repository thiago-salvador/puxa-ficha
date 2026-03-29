# Mapa de APIs e Fontes de Dados Públicos

## Referência técnica para ingestão de dados

---

## 1. TSE - Tribunal Superior Eleitoral

### Portal de Dados Abertos
- **URL base:** https://dadosabertos.tse.jus.br/
- **Formato:** CSV, JSON (download em lote)
- **Autenticação:** Nenhuma
- **Atualização:** Diária durante período eleitoral

### Datasets disponíveis por candidato:
| Dataset | O que contém | URL |
|---------|-------------|-----|
| Candidatos | Nome, partido, cargo, nº urna, email, situação | `/dataset/candidatos-{ano}` |
| Bens de Candidatos | Patrimônio declarado (tipo, descrição, valor) | Incluído no dataset de candidatos |
| Coligações | Partidos aliados em cada chapa | Incluído no dataset de candidatos |
| Redes sociais | URLs dos perfis dos candidatos | Incluído (eleições 2020+) |
| Fotos | Foto oficial do candidato | Incluído (eleições 2012+) |
| Propostas de governo | PDF com plano de governo | Incluído (eleições 2018+) |
| Certidões criminais | Certidões dos candidatos | Incluído (eleições 2018+) |
| Prestação de contas | Receitas e despesas de campanha | `/dataset/prestacao-de-contas-{ano}` |
| Resultados | Votos por candidato/município/zona | `/dataset/resultados-{ano}` |

### DivulgaCandContas (API)
- **URL:** https://divulgacandcontas.tse.jus.br/divulga/
- **Uso:** Consulta individual de candidatos registrados
- **Cobertura:** Eleições desde 2004
- **Nota:** Dados de 2026 só ficam disponíveis após 15/agosto (registro de candidaturas)

### ANTES do registro oficial (o que fazer agora):
- Baixar dados de eleições anteriores (2018, 2022) dos pré-candidatos
- Patrimônio declarado em eleições passadas
- Financiamento de campanhas anteriores
- Histórico de candidaturas

---

## 2. Câmara dos Deputados

### API REST v2
- **URL base:** https://dadosabertos.camara.leg.br/api/v2/
- **Swagger:** https://dadosabertos.camara.leg.br/swagger/api.html
- **Formato:** JSON, XML
- **Autenticação:** Nenhuma
- **Rate limit:** Não documentado, mas generoso
- **Atualização:** Diária

### Endpoints principais:

```
# Buscar deputado por nome
GET /deputados?nome=Flavio+Bolsonaro&ordem=ASC&ordenarPor=nome

# Perfil completo de um deputado (por ID)
GET /deputados/{id}

# Gastos com cota parlamentar
GET /deputados/{id}/despesas?ano=2025&itens=100

# Votações de um deputado
GET /deputados/{id}/votacoes

# Proposições de autoria
GET /proposicoes?idDeputadoAutor={id}&ordem=DESC&ordenarPor=id

# Frentes parlamentares
GET /deputados/{id}/frentes

# Órgãos (comissões) de que participa
GET /deputados/{id}/orgaos

# Detalhes de uma votação específica
GET /votacoes/{id}

# Votos em uma votação
GET /votacoes/{id}/votos
```

### Campos retornados por deputado:
- id, uri, nome, siglaPartido, siglaUf
- email, urlFoto
- dataNascimento, municipioNascimento, ufNascimento
- escolaridade
- cpf (parcial)
- situacao, condicaoEleitoral
- gabinete (sala, prédio, telefone)

### Download em lote (alternativa à API):
- **URL:** https://dadosabertos.camara.leg.br/arquivos/
- CSVs de deputados, votações, proposições, despesas por ano
- Mais rápido pra ingestão inicial

---

## 3. Senado Federal

### API REST
- **Swagger:** https://legis.senado.leg.br/dadosabertos/api-docs/swagger-ui/index.html
- **URL base:** https://legis.senado.leg.br/dadosabertos/
- **Formato:** JSON, XML
- **Autenticação:** Nenhuma

### Endpoints principais:

```
# Lista de senadores em exercício
GET /senador/lista/atual

# Perfil de senador
GET /senador/{codigo}

# Votações de um senador
GET /senador/{codigo}/votacoes

# Autorias (matérias de autoria)
GET /senador/{codigo}/autorias

# Mandatos do senador
GET /senador/{codigo}/mandatos

# Comissões
GET /senador/{codigo}/comissoes

# Votações nominais (todas)
GET /plenario/lista/votacao/{ano}
```

---

## 4. Portal da Transparência (CGU)

- **URL:** https://api.portaldatransparencia.gov.br/
- **Autenticação:** Chave de API (gratuita, solicitar em https://portaldatransparencia.gov.br/api-de-dados)
- **Dados úteis:** 
  - Gastos com cartão corporativo
  - Servidores federais
  - Viagens a serviço
  - Licitações e contratos

---

## 5. Dados Judiciais

### CNJ (Conselho Nacional de Justiça)
- **DataJud:** https://datajud-wiki.cnj.jus.br/
- Consulta de processos por API
- **Limitação:** Busca por número do processo, não por nome/CPF facilmente

### STF
- **URL:** https://portal.stf.jus.br/
- Jurisprudência e processos pesquisáveis
- Útil pra políticos com foro privilegiado

### Alternativa prática:
- Escrapear JusBrasil (https://www.jusbrasil.com.br/) pra processos por nome
- Usar dados do TSE (certidões criminais incluídas no dataset de candidatos)
- Curadoria manual dos casos mais relevantes

---

## 6. Base dos Dados (basedosdados.org)

- **URL:** https://basedosdados.org/
- **Vantagem:** Dados da Câmara e TSE já limpos e normalizados
- **Acesso:** BigQuery (Google Cloud, free tier suficiente) ou pacotes Python/R
- **Datasets relevantes:**
  - `br_camara_atividade_legislativa` (deputados, votações, proposições)
  - `br_tse_eleicoes` (candidatos, resultados, prestação de contas)

```python
import basedosdados as bd

# Exemplo: buscar todas as candidaturas de Flávio Bolsonaro
df = bd.read_sql(
    "SELECT * FROM `basedosdados.br_tse_eleicoes.candidatos` WHERE nome_candidato LIKE '%FLAVIO BOLSONARO%'",
    billing_project_id="seu-projeto"
)
```

---

## 7. APIs complementares

### IBGE
- **URL:** https://servicodados.ibge.gov.br/api/
- Dados demográficos por município/estado
- Útil pra contextualizar: "este estado tem X habitantes e Y IDH"

### Bluesky Firehose
- **URL:** https://bsky.app/ (AT Protocol)
- Monitoramento de menções a candidatos em tempo real
- Útil pra fase 2 (após MVP)

---

## Estratégia de ingestão

### Fase 1 (MVP - agora):
1. Baixar CSVs do TSE (eleições 2018 e 2022) pra todos os pré-candidatos
2. Consultar API da Câmara pra deputados/ex-deputados
3. Consultar API do Senado pra senadores/ex-senadores
4. Curadoria manual dos processos judiciais (fontes jornalísticas)
5. Curadoria manual dos pontos de atenção

### Fase 2 (pós-registro de candidaturas, agosto):
1. Ingestão automática dos dados oficiais de candidatos 2026 do TSE
2. Dados de prestação de contas em tempo real
3. Atualização automática via cron jobs

### Volume estimado:
- ~50 candidatos x ~500KB de dados cada = ~25MB total
- Cabe folgado no tier gratuito do Supabase (500MB)
