# Ingestão dos programas de governo estaduais de 2026

## Finalidade

O importador transforma o inventário oficial e os ZIPs estaduais do TSE em registros server-only para revisão. Ele nunca escreve `aprovado`. Uma candidatura sai como `em_revisao`, `perfil_local_ausente`, `sem_documento_oficial` ou `falha_de_extracao`.

A associação usa somente a chave `2026:GOVERNADOR:<UF>:<SQ_CANDIDATO>`. O `SQ_CANDIDATO` oficial pode ter 11 ou 12 dígitos. Nome, partido e slug não substituem a identidade eleitoral, mas integram o fingerprint que invalida uma decisão humana stale.

## Comando

Executar com Node 24:

```bash
npx -y -p node@24 -c 'node --conditions react-server --import tsx scripts/programas-governo-governadores-2026.ts --ufs=AC,AM --inventory=scripts/data/programas-governo-governadores-2026/inventario-2026-08-26.json --archive-dir=/caminho/para/zips --output-dir=/caminho/server-only --models-config=/caminho/modelos.json --cache-dir=/caminho/cache-passagens'
```

Os quatro argumentos de escopo e arquivos são obrigatórios:

- `--ufs`: lista de UFs separada por vírgula.
- `--inventory`: snapshot versionado do inventário.
- `--archive-dir`: diretório que contém `proposta_governo_2026_<UF>.zip`.
- `--output-dir`: destino isolado dos registros e do `manifesto-ingestao.json`.

`--models-config` é necessário para candidaturas extraíveis. Ausências podem ser materializadas sem modelos.

`--cache-dir` é opcional e define onde ficam os checkpoints por passagem da geração multipassagem; sem ele o padrão é `<output-dir>/.cache-passagens`. Cada chave de checkpoint deriva de identidade completa do candidato, hashes dos documentos, versão do prompt, modelo e planejador multipassagem, índice e hash da passagem. Passagem concluída nunca é reenviada ao modelo: a mesma execução ou uma retomada reutilizam o checkpoint e apenas a passagem pendente (ou sintese pendente) consome chamada nova.

## Geração em lote e multipassagem

Quando o texto total do candidato excede `380_000` bytes UTF-8, o importador não envia tudo numa única chamada. O plano multipassagem (`scripts/lib/programas-governo-multipassagem.ts`) fatia páginas inteiras em passagens de no máximo esse limite, executa até três passagens em paralelo com concorrência limitada, grava cada passagem no cache imediatamente após a resposta válida e depois faz uma única síntese por candidato usando somente os fatos literais sobreviventes (`extrairFatosPassagem` + `sintetizarDeFatos`, mesmos comandos externos declarados na configuração).

Orçamento de chamadas, registrado no registro via `ingestao.modelos.geracaoMultipassagem` e agregado no manifesto:

- uma chamada inicial por passagem e, no máximo, uma repetição só da passagem que falhou;
- uma síntese por candidato e, no máximo, uma repetição só da síntese;
- nenhuma repetição integral de candidato dentro de uma execução;
- falha persistente de passagem bloqueia o candidato em `em_revisao` com erro explícito mantendo checkpoints; a retomada executa só o que falta.

O manifesto também inclui a soma real de chamadas internas por etapa e a versão de Node usada pelo processo.

## Contrato dos modelos

O arquivo de configuração contém comandos externos explícitos:

```json
{
  "generator": {
    "name": "Anthropic Claude",
    "version": "versao-fixada",
    "command": "/caminho/para/runner-generator",
    "args": [],
    "timeoutMs": 600000,
    "maxAttempts": 2
  },
  "judge": {
    "name": "OpenAI GPT",
    "version": "versao-fixada",
    "command": "/caminho/para/runner-judge",
    "args": [],
    "timeoutMs": 600000,
    "maxAttempts": 2
  }
}
```

Generator e judge devem pertencer a famílias diferentes. Cada comando recebe no `stdin` um JSON com `schema`, `promptVersion` e `input`, e devolve somente o objeto JSON pedido no `stdout`. O adapter limita timeout, resposta a 8 MiB e tentativas a duas. Nome, versão, prompt e número de tentativas ficam registrados no artefato.

As versões esperadas de prompt são definidas uma única vez pelo cargo e compartilhadas por ingestão, auditoria e aprovação. Para governador, o contrato exige `programa-governo-governadores-generator-v1` e `programa-governo-governadores-judge-v2`. O caminho presidencial mantém as versões legadas. A revisão v2 do judge acrescenta o texto da afirmação (`claimTexto`) em cada item, sem o qual não é possível avaliar suporte, números, neutralidade, mistura ou cobertura.

O generator deve produzir resumo, frases, temas e evidências com `documentoId`, página e trecho literal. O judge usa `scripts/prompts/programa-governo-governadores-judge-v2.schema.json` e devolve uma avaliação para cada claim em cada uma das seis dimensões: suporte, números, neutralidade, mistura, identidade e cobertura. Os vínculos de documento, página e evidência devem ser cópias exatas da entrada. ID ausente, extra, duplicado ou vínculo alterado falha fechado.

## Integridade e extração

Antes da geração, o importador verifica:

1. chave eleitoral, slug e unicidade do inventário;
2. sequência completa `01`, `02` e assim por diante;
3. hash e tamanho do ZIP oficial;
4. arquivo interno, hash e tamanho de cada PDF;
5. hash da fonte e número de páginas retornados pela extração;
6. uma seção e uma entrada de `pageMap` por página, na ordem original;
7. método, versão, origem e SHA-256 do texto de cada página.

A extração reutiliza o adapter hermético existente. Primeiro tenta `pdftotext` por página. OCR só roda para a página cujo texto não seja confiável. Workspace temporário é removido mesmo em falha. Um documento sem texto confiável depois do OCR vira falha explícita.

## Saída e checkpoint

Cada registro é gravado em `<output-dir>/<UF>/<slug-ou-SQ>.json`. `manifesto-ingestao.json` contém contagens e a lista explícita de bloqueios. Registros com perfil ausente preservam e extraem todos os documentos oficiais encontrados, mas não executam modelos. Quando também não existe documento, nenhum ZIP é aberto e a fonte fica package-only, com `arquivoNome` e `arquivoNoPacote` nulos. O importador nunca inventa `_01.pdf`, URL individual ou associação por similaridade.

`em_revisao` nunca significa aprovação. Com Eval completo, geração e julgamento estruturados terminaram e todas as dimensões receberam `yes`. Qualquer `no`, `unknown`, resposta incompleta ou falha de generator/judge mantém o registro em `em_revisao`, com `ingestao.etapa`, `ingestao.erro` e `eval.completo=false`; auditoria e aprovação o recusam. A falha só vira `falha_de_extracao` quando aconteceu na obtenção, hash, página ou extração do documento.

O batch sempre materializa os registros e o manifesto antes de avaliar o resultado agregado. Se houver falha de extração, modelo ou Eval, o comando termina com status nonzero e aponta para os bloqueios do manifesto. Ausência oficial e perfil local ausente continuam estados finais esperados, não sucesso editorial nem falha operacional.

## Promoção e aprovação seguras

O stage e o approval operam em dry-run por padrão. `--apply` é obrigatório para substituir registros. Na aplicação, cada arquivo existente é copiado para o diretório de backup antes da troca; depois da troca, o JSON é relido, validado contra o contrato e comparado ao conteúdo preparado. O recibo só é escrito após todos os readbacks passarem. `--backup-dir` e `--receipt` permitem escolher destinos fora do diretório de registros; sem eles, cada comando usa um destino local isolado e datado.

O fingerprint humano cobre identidade completa, incluindo nome de urna e partido, fonte completa, conjunto ordenado de documentos, hashes, extrações, resumo e metadados separados de generator e judge. Qualquer mudança torna a decisão stale. Nenhuma das duas etapas cria uma decisão humana automaticamente.

## Driver de batch nacional

O processamento de muitas candidaturas usa o driver `scripts/data/programas-governo-governadores-2026/batch-driver.mjs`, executado com o binário Node 24 resolvido uma única vez. O driver nunca chama modelo: apenas orquestra processos do CLI canônico, um processo por candidato.

- `plan` deriva a fila NDJSON do inventário com `--plan-only`, valida contagens por UF contra o inventário (fail-closed), exclui as UFs de uma onda já concluída e ordena por custo estimado decrescente, calculado a partir de páginas e passagens planejadas.
- `run` consome a fila com rampa de concorrência 2, 4 e 6 por disparos, semáforo global de seis processos geradores e no máximo dois candidatos multipassagem simultâneos. Cada item grava `estado.json` atomicamente (`pending`, `extracting`, `generator_pending`, `generator_complete`, `judge_pending`, `complete`, `blocked`, `retryable_error`), o que permite retomada sem repetir candidato concluído.
- Duas falhas consecutivas de cota ou autenticação param o driver com checkpoints preservados; o mesmo vale para taxa de erro técnico acima de 5% e para o limite de wall time. A parada escreve `parada.json` com as unidades pendentes.
- As extrações são cacheadas por SHA-256 do PDF, método e versão do extrator; as passagens multipassagem usam o cache compartilhado de passagens. Retries repetem somente a unidade que falhou.
- `consolidar` copia os registros para a árvore regional (`ondas/<regiao>/<UF>/`) verificando identidade e recusa mistura de candidato.
- `PF_QWEN_EXTRA_ARGS` e `PF_CODEX_EXTRA_ARGS` permitem argumentos extras aos CLIs de modelo, como `--safe-mode` no Qwen, que evita carregar MCP servers em chamadas batch.

## Teste hermético

```bash
npx -y -p node@24 -c 'node --conditions react-server --import tsx --test tests/programa-governo-governadores-ingestao.test.ts'
```

O teste usa inventário, ZIPs, PDFs, extração e respostas de modelos sintéticos. Nenhum modelo, rede ou arquivo eleitoral real é acionado.
