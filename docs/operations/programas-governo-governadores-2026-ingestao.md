# Ingestão dos programas de governo estaduais de 2026

## Finalidade

O importador transforma o inventário oficial e os ZIPs estaduais do TSE em registros server-only para revisão. Ele nunca escreve `aprovado`. Uma candidatura sai como `em_revisao`, `perfil_local_ausente`, `sem_documento_oficial` ou `falha_de_extracao`.

A associação usa somente a chave `2026:GOVERNADOR:<UF>:<SQ_CANDIDATO>`. O `SQ_CANDIDATO` oficial pode ter 11 ou 12 dígitos. Nome, partido e slug não substituem a identidade eleitoral, mas integram o fingerprint que invalida uma decisão humana stale.

## Comando

Executar com Node 24:

```bash
npx -y -p node@24 -c 'node --conditions react-server --import tsx scripts/programas-governo-governadores-2026.ts --ufs=AC,AM --inventory=scripts/data/programas-governo-governadores-2026/inventario-2026-08-26.json --archive-dir=/caminho/para/zips --output-dir=/caminho/server-only --models-config=/caminho/modelos.json'
```

Os quatro argumentos de escopo e arquivos são obrigatórios:

- `--ufs`: lista de UFs separada por vírgula.
- `--inventory`: snapshot versionado do inventário.
- `--archive-dir`: diretório que contém `proposta_governo_2026_<UF>.zip`.
- `--output-dir`: destino isolado dos registros e do `manifesto-ingestao.json`.

`--models-config` é necessário para candidaturas extraíveis. Ausências podem ser materializadas sem modelos.

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

As versões esperadas de prompt são definidas uma única vez pelo cargo e compartilhadas por ingestão, auditoria e aprovação. Para governador, o contrato exige `programa-governo-governadores-generator-v1` e `programa-governo-governadores-judge-v1`. O caminho presidencial mantém as versões legadas.

O generator deve produzir resumo, frases, temas e evidências com `documentoId`, página e trecho literal. O judge usa `scripts/prompts/programa-governo-governadores-judge-v1.schema.json` e devolve uma avaliação para cada claim em cada uma das seis dimensões: suporte, números, neutralidade, mistura, identidade e cobertura. Os vínculos de documento, página e evidência devem ser cópias exatas da entrada. ID ausente, extra, duplicado ou vínculo alterado falha fechado.

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

## Teste hermético

```bash
npx -y -p node@24 -c 'node --conditions react-server --import tsx --test tests/programa-governo-governadores-ingestao.test.ts'
```

O teste usa inventário, ZIPs, PDFs, extração e respostas de modelos sintéticos. Nenhum modelo, rede ou arquivo eleitoral real é acionado.
