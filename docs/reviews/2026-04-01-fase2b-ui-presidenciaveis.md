# Fase 2B — Presidenciaveis (UI Publicada)

Data: `2026-04-01`

Status do artefato:

- verificacao manual assistida por Codex na superficie publicada
- amostra validada em navegador real local
- home remota conferida no deploy publico

## Objetivo

Validar que o que o usuario le na UI publicada bate com o snapshot factual revisado da coorte de presidenciaveis.

## Superficies auditadas

- home `/`
- ficha individual `/candidato/ciro-gomes`
- metadata HTML de `/candidato/ciro-gomes`
- metadata HTML de `/comparar`
- `robots.txt`
- `sitemap.xml`
- home remota `https://puxa-ficha.vercel.app/`

## Achados desta rodada

### 1. Divergencia factual real na UI de presidenciaveis

Na primeira verificacao da home local, a UI ainda publicava partidos antigos para quatro nomes sensiveis:

- `aldo-rebelo` aparecia como `PCdoB`
- `ciro-gomes` aparecia como `PSB`
- `ratinho-junior` aparecia como `PSC`
- `ronaldo-caiado` aparecia como `DEM`

Diagnostico:

- o problema estava na base persistida de `candidatos`, nao nos componentes do front
- a UI estava renderizando corretamente o que recebeu

Acao tomada:

- sincronizacao factual da coorte com:

```bash
npx tsx scripts/sync-audit-assertions.ts --cohort presidenciaveis
```

Resultado:

- home, comparador e ficha passaram a refletir os valores curados
- o deploy publico tambem passou a expor as siglas corrigidas na home

### 1.1 Inconsistencia estrutural entre bio, trajetoria e historico partidario

O caso `ciro-gomes` mostrou um problema mais profundo de confianca:

- bio e hero publicados com `PSDB` e `Sem cargo publico`
- aba de trajetoria publicava cargos com `0 - atual`
- aba de trajetoria atribuía partidos historicos errados
- historico partidario terminava em `Sem partido`, sem refletir a filiacao atual publicada

Diagnostico:

- a tabela `historico_politico` continha placeholders gerados de `Wikipedia (categorias)`
- todos esses registros vinham com `periodo_inicio = 0` e observacao de periodo nao determinado
- na base auditada havia `207` registros desse tipo, todos de baixa confianca
- alem disso, havia ao menos `5` candidatos cuja timeline partidaria nao batia com a filiacao atual publicada

Acao tomada:

- introduzido filtro de integridade no data layer para ocultar registros de `historico_politico` com baixa confianca
- a ficha passa a marcar `historico_em_revisao` e `timeline_partidaria_incompleta`
- a UI publica exibe aviso explicito quando a trajetoria foi ocultada por falta de confianca
- a aba de trajetoria deixa de mostrar cargos com `0 - atual` como se fossem fatos consolidados

Resultado:

- a aba de trajetoria do Ciro deixou de exibir `Deputado Estadual`, `Governador`, `Ministro` e `Prefeito` como registros `0 - atual`
- a ficha agora informa explicitamente que a filiacao atual publicada e `PSDB` e que a timeline partidaria ainda esta incompleta

### 2. Quebra visual de fotos remotas via Wikimedia

Na home local, varias fotos estavam falhando com `429 (Too Many Requests)` no pipeline do `next/image`, afetando a superficie publicada dos cards e do comparador.

Exemplos observados:

- `lula`
- `romeu-zema`
- `renan-santos`
- `rui-costa-pimenta`

Diagnostico:

- o gargalo estava no otimizador do `next/image` para URLs de `upload.wikimedia.org`
- nao era um problema factual de dados, mas era um problema real de publicacao

Acao tomada:

- criacao do helper `shouldBypassImageOptimization()` em `src/lib/utils.ts`
- desligamento seletivo da otimizacao apenas para fotos do Wikimedia em:
  - `src/components/CandidatoCard.tsx`
  - `src/components/CandidatoGrid.tsx`
  - `src/components/ComparadorPanel.tsx`
  - `src/app/candidato/[slug]/page.tsx`
- adicao de `priority` na foto hero da ficha individual

Resultado:

- a home local voltou limpa de erros de imagem no navegador
- a ficha individual de `ciro-gomes` ficou sem erros e sem warnings de LCP

## Revalidacao

### Navegador local

Home:

- cards publicados com siglas corretas para `aldo-rebelo`, `ciro-gomes`, `ratinho-junior` e `ronaldo-caiado`
- comparador embutido na home com os mesmos partidos corrigidos
- sem erros de console apos o ajuste do Wikimedia

Ficha `ciro-gomes`:

- titulo do navegador: `Ciro Gomes (PSDB) — Puxa Ficha`
- hero publicado com `PSDB · Presidente`
- foto, hero, tabs e secoes principais carregando sem erros de console

### Metadata HTML

`/candidato/ciro-gomes`

- `title`: `Ciro Gomes (PSDB) — Puxa Ficha`
- `description` coerente com a biografia publicada
- `og:title`: `Ciro Gomes (PSDB) — Puxa Ficha`

`/comparar`

- `title`: `Comparador de candidatos — Puxa Ficha`
- `description` e `og:description` coerentes com a rota

### Superficies indexaveis

`robots.txt`

- `Allow: /`
- `Disallow: /styleguide`
- `Disallow: /internaltest`
- `Sitemap: https://puxaficha.com.br/sitemap.xml`

`sitemap.xml`

- home presente
- `/explorar` presente
- `/comparar` presente
- fichas individuais presentes

### Deploy publico

Conferencia manual da home remota em `https://puxa-ficha.vercel.app/`:

- `aldo-rebelo` publicado com `DC`
- `ciro-gomes` publicado com `PSDB`
- `ratinho-junior` publicado com `PSD`
- `ronaldo-caiado` publicado com `PSD`

## Comandos usados

```bash
npx tsx scripts/sync-audit-assertions.ts --cohort presidenciaveis
npm run lint -- src/lib/utils.ts src/components/CandidatoCard.tsx src/components/CandidatoGrid.tsx src/components/ComparadorPanel.tsx 'src/app/candidato/[slug]/page.tsx'
curl -s http://localhost:3000/robots.txt
curl -s http://localhost:3000/sitemap.xml
```

Verificacao em navegador feita com Playwright CLI sobre `http://localhost:3000/`.

## Conclusao desta rodada

- a Trilha B foi efetivamente iniciada para a coorte de presidenciaveis
- a superficie publicada principal agora bate com o snapshot factual revisado nessa amostra
- o bug de publicacao mais grave encontrado na rodada foi corrigido

## Escopo residual

- expandir a mesma verificacao de UI publicada para governadores prioritarios
- ampliar a amostra de fichas individuais alem de `ciro-gomes`
- transformar a verificacao da Trilha B em rotina automatizada quando o time quiser sair do modo amostral
