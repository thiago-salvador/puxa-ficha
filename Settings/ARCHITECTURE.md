# Arquitetura

## Visão geral

O Puxa Ficha é uma aplicação Next.js com App Router. O frontend e as rotas de
API vivem no mesmo projeto. O Supabase/PostgreSQL armazena o domínio, views
públicas e logs de coleta. A Vercel serve a aplicação, executa crons e mantém o
Data Cache. GitHub Actions executa CI, auditorias e ingestões programadas.

```text
fontes públicas
    -> scripts de ingestão e curadoria
    -> validação de identidade e proveniência
    -> migrations/tabelas/logs no Supabase
    -> views públicas e DTOs
    -> APIs Next.js
    -> Data Cache e tags
    -> ficha, comparador, quiz e páginas públicas
    -> readback e régua de cobertura
```

## Diretórios principais

| Caminho | Responsabilidade |
|---|---|
| `src/app` | Páginas App Router e 22 rotas de API. |
| `src/components` | Componentes de ficha e superfícies compartilhadas. |
| `src/lib` | DTOs, acesso a dados, cache, segurança e regras de domínio. |
| `src/data` | Registros versionados, incluindo as fontes da metodologia. |
| `scripts` | Ingestão, curadoria, auditoria, cache e manutenção. |
| `scripts/lib` | Biblioteca compartilhada dos pipelines. |
| `supabase/migrations` | Schema e snapshots sequenciais de dados. |
| `tests` | Testes unitários, de contrato, integração visual e acessibilidade. |
| `public` | Imagens e arquivos estáticos. |
| `Settings` | Contrato operacional e estado verificável do projeto. |

## Superfície pública

- `/api/candidato-slugs`: universo público de fichas.
- `/api/candidato-profile/[slug]`: payload principal da ficha.
- Rotas filhas carregam frentes pesadas, como projetos e legislação.
- `candidatos_publico`, `v_ficha_candidato`, `v_comparador` e views auxiliares
  definem o recorte público do banco.
- Não existe uma rota pública canônica `/api/candidatos`.

## Domínio de dados

As tabelas centrais incluem `candidatos`, `historico_politico`,
`mudancas_partido`, `patrimonio`, `financiamento`, `votacoes_chave`,
`projetos_lei`, `gastos_parlamentares`, `gastos_executivo`,
`legislacao_mandato_executivo`,
`processos`, `sancoes_administrativas`, `pontos_atencao`,
`posicoes_declaradas`, `noticias_candidato` e `coleta_log`.

`coleta_log_ultima` é a leitura de procedência mais recente por fonte e alvo.
Tabelas de quarentena recebem cruzamentos que não passaram pelos gates de
identidade ou consistência. Elas não são publicação.

## Cache

O cache público usa tags de domínio. As principais são:

```text
public-candidatos
public-candidato-metadata
public-candidato-ficha
public-candidatos-resumo
public-candidatos-comparaveis
public-indicadores-all
public-indicadores-estado
quiz-dataset
ranking-data
doador-reverse
```

Ingestões que mudam dados públicos devem chamar `/api/revalidate` com as tags
afetadas e depois conferir a rota pública. Invalidar tudo por conveniência não
substitui o mapeamento correto de dependências.

## Observabilidade e proteção

Sentry, Cloudflare Web Analytics e os eventos operacionais no Supabase cobrem
erro e comportamento da aplicação. Middleware e cabeçalhos de segurança
protegem as rotas. Endpoints internos e crons exigem seus respectivos
segredos; os valores nunca são expostos ao cliente ou documentados no
repositório.

## Limite arquitetural importante

As migrations contêm schema e snapshots verificados de dados públicos. Elas
sobem um banco vazio, mas não são regeneráveis integralmente apenas pelo código.
Por isso, mudanças de dados exigem o mesmo cuidado de uma mudança de schema:
escopo fechado, dry-run, persistência auditável e readback.
