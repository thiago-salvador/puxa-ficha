# Supabase Anon Audit - 2026-04-01

## Contexto

Auditoria executada em 1 de abril de 2026 no projeto Supabase linkado ao repo, usando a `NEXT_PUBLIC_SUPABASE_ANON_KEY` real da app.

Objetivo:

- confirmar o que o papel `anon` conseguia ler antes da migracao
- aplicar a superficie publica minima
- repetir os mesmos requests depois da mudanca

## Antes da migracao

### `public.candidatos`

Request anon:

- `select=cpf,cpf_hash,email_campanha,wikidata_id&limit=1`

Resultado:

- HTTP `200`
- retorno continha `cpf`, `cpf_hash`, `email_campanha` e `wikidata_id`

Conclusao:

- exposicao real de dados pessoais e colunas internas pela tabela base

### `public.v_ficha_candidato`

Request anon:

- `select=*`

Resultado:

- view acessivel ao `anon`
- nao expunha `cpf`
- expunha `cpf_hash`

Conclusao:

- havia vazamento residual pela view publica de ficha

### `public.v_comparador`

Request anon:

- `select=*`

Resultado:

- view acessivel ao `anon`
- projecao ja era minima
- sem `cpf`, `cpf_hash`, `email_campanha` ou `wikidata_id`

Conclusao:

- `v_comparador` nao era o problema principal

## Mudanca aplicada

Migration aplicada no projeto linkado:

- [20260401002545_harden_public_candidate_surface.sql](/Users/thiagosalvador/Documents/Apps/Pessoal/PuxaFicha/supabase/migrations/20260401002545_harden_public_candidate_surface.sql)

O que ela fez:

- criou `public.candidatos_publico` com projecao explicita
- recriou `public.v_ficha_candidato` sem `c.*`
- recriou `public.v_comparador` em cima de `candidatos_publico`
- concedeu `SELECT` nas views publicas
- revogou `SELECT` direto em `public.candidatos` para `anon` e `authenticated`

Metodo de aplicacao:

- `supabase db push --linked --dry-run`
- `supabase db push --linked`

## Depois da migracao

### `public.candidatos`

Mesmo request anon:

- `select=cpf,cpf_hash,email_campanha,wikidata_id&limit=1`

Resultado:

- HTTP `401`
- mensagem: `permission denied for table candidatos`

Conclusao:

- leitura direta da tabela base foi fechada para a app publica

### `public.candidatos_publico`

Request anon:

- `select=*&limit=1`

Resultado:

- view acessivel
- chaves retornadas:
  - `id`
  - `nome_completo`
  - `nome_urna`
  - `slug`
  - `data_nascimento`
  - `idade`
  - `naturalidade`
  - `formacao`
  - `profissao_declarada`
  - `genero`
  - `estado_civil`
  - `cor_raca`
  - `partido_atual`
  - `partido_sigla`
  - `cargo_atual`
  - `cargo_disputado`
  - `estado`
  - `status`
  - `situacao_candidatura`
  - `biografia`
  - `foto_url`
  - `site_campanha`
  - `redes_sociais`
  - `fonte_dados`
  - `ultima_atualizacao`

Conclusao:

- a projecao publica ficou alinhada ao contrato do app

### `public.v_ficha_candidato`

Request anon:

- `select=*&limit=1`

Resultado:

- view acessivel
- sem `cpf_hash`
- sem `cpf`
- sem `email_campanha`
- sem `wikidata_id`

Conclusao:

- a ficha publica deixou de carregar o vazamento residual

### `public.v_comparador`

Request anon:

- `select=*&limit=1`

Resultado:

- view acessivel
- projecao continua minima

Conclusao:

- comparador permaneceu funcional sem reabrir a superficie sensivel

## Estado final

### Fechado

- exposicao anon de `cpf`, `cpf_hash`, `email_campanha` e `wikidata_id` pela tabela base
- vazamento de `cpf_hash` por `v_ficha_candidato`

### Mantido

- `v_comparador` continua publica e enxuta
- app publica passou a depender de `candidatos_publico`

### Fora desta auditoria

- timeouts de rede no build/SSG
- triagem de `camara_sem_cargo_atual`
- qualquer revisao de escrita administrativa no banco
