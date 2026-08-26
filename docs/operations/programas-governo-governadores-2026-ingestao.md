# Ingestão dos programas de governo estaduais de 2026

## Finalidade

O importador transforma o inventário oficial e os ZIPs estaduais do TSE em registros server-only para revisão. Ele nunca escreve `aprovado`. Uma candidatura sai como `em_revisao`, `perfil_local_ausente`, `sem_documento_oficial` ou `falha_de_extracao`.

A associação usa somente a chave `2026:GOVERNADOR:<UF>:<SQ_CANDIDATO>`. Nome, partido e slug não substituem a identidade eleitoral.

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

Cada registro é gravado em `<output-dir>/<UF>/<slug-ou-SQ>.json`. `manifesto-ingestao.json` contém apenas contagens por estado. Registros com perfil ausente preservam e extraem todos os documentos oficiais encontrados, mas não executam modelos. Quando também não existe documento, nenhum ZIP é aberto. Registros com documento ausente não inventam URL individual nem fazem associação por similaridade.

`em_revisao` significa que geração e julgamento estruturados terminaram e que todas as avaliações esperadas foram devolvidas. Vereditos `no` e `unknown` permanecem como bloqueadores no artefato. Nenhum resultado desta etapa constitui aprovação humana ou autorização de publicação.

## Teste hermético

```bash
npx -y -p node@24 -c 'node --conditions react-server --import tsx --test tests/programa-governo-governadores-ingestao.test.ts'
```

O teste usa inventário, ZIPs, PDFs, extração e respostas de modelos sintéticos. Nenhum modelo, rede ou arquivo eleitoral real é acionado.
