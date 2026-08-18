# Financiamento, reconciliacao integral do universo

Data da medicao: 2026-08-10. Execucao: `pf-ajustes-financiamento-20260810`.

## Universo antes da carga

- 194 fichas publicas.
- 722 pleitos disputados materializados a partir do historico politico.
- 235 pleitos em `nao_coletado`, distribuidos por 107 fichas.
- 121 lacunas entre 2002 e 2008. A referencia anterior de 93 era apenas o
  subconjunto com receita encontrada, nao o universo historico completo.

## Desfecho preparado

O manifesto tem uma linha unica por slug e ano para os 235 alvos:

- 141 `publicado`.
- 57 `ausencia_oficial` com SQ, ano, UF e URL oficial.
- 37 `erro`, sem conversao em ausencia. Destes, 19 sao de 2004 porque o layout
  oficial de receitas nao traz `SQ_CANDIDATO`; os outros 18 nao tiveram
  identidade unica comprovada no cruzamento.
- 0 `zero_declarado` novo nesta coorte.
- 0 `nao_coletado` depois da carga simulada.

Distribuicao por ano: 2002 28/0/4, 2004 0/0/21, 2006 34/0/4, 2008 26/2/2,
2010 5/9/1, 2012 2/5/2, 2014 7/7/0, 2016 15/4/1, 2018 7/5/0,
2020 6/5/1, 2022 10/17/0 e 2024 1/3/1. Em cada trio a ordem e
`publicado/ausencia_oficial/erro`.

Para 2012 e 2014, a coleta usa somente `prestacao_final_<ano>.zip`. Somar as
parciais ao fechamento pode preservar recibos substituidos ou cancelados. A
reexecucao do pacote final completo corrigiu os totais de 2012 de Vera Lucia
para R$ 40.245,20 e de Patrus Ananias para R$ 17.408.279,15, sem alterar os
desfechos ou as cardinalidades do universo.

## Identidade e regressao

O casamento historico exige `SQ_CANDIDATO + ano + UF` e corrobora o nome
oficial antes de aceitar um SQ pre-carregado. Isso impede a colisao real do SQ
14144, repetido em UFs diferentes, que antes associava recibos da Bahia ao
Daciolo no Rio.

Casos obrigatorios comprovados nos pacotes oficiais:

- Cabo Daciolo, 2006, RJ, SQ 12132, R$ 1.259,44.
- Cabo Daciolo, 2008, RJ, SQ 14144, R$ 720,00.
- Flavio Bolsonaro, 2002, RJ, SQ 851, R$ 5.988,00.
- Rui Costa Pimenta, 2006, BR, SQ 27, R$ 11.000,00. Esta linha ja existia e
  permanece como regressao de readback, sem entrar novamente na coorte de 235.
- O teste tambem escolhe dinamicamente ao menos um publicado fora desses nomes
  como amostra adversarial.

## Fontes e reprodutibilidade

Os 12 pacotes oficiais usados pelos dry-runs têm URL e SHA-256 congelados em
`fontes/pacotes-oficiais.json`. Os pacotes legados preservados localmente foram
validados inicialmente por SHA-256:

- 2002: `bca94708e30cc49e04dfe17e8265734060da25fd5f5624dbc631b02114dc8e72`.
- 2004: `d4903b304223b663fed972fe8aad251ca89753f5924e30aee5b4c993f24d97e5`.
- 2006: `9fb37e8e82d25e721a5e8e359e4d64ff4b180ff3dde7f6abc83aecb6f2eca18a`.
- 2008: `d177054a0cf219a6232f9298c835939c13b9b5aa413318ca9682c792828e9bfb`.

O manifesto versionado tem SHA-256
`a35b1820cb85eb1964d069ebb31ee53a9aa784f867a78180029850f9d3ec4c8f`.
Ele e gerado por `scripts/audit/gerar-manifesto-financiamento-universo.ts`
a partir de `fontes/lacunas.json` e dos 12 dry-runs anuais versionados em
`fontes/dry-runs/`. `npm run audit:financiamento:manifest` regenera e compara o
resultado byte a byte em checkout limpo. `npm run audit:financiamento:fontes`
baixa os 12 ZIPs oficiais em streaming e recalcula todos os SHA-256 contra
`fontes/pacotes-oficiais.json`; esses recibos validam URL, ano e hash, em vez
de depender de valores copiados neste README.
`scripts/audit/gerar-sql-financiamento-universo.ts` deriva forward e readback do
mesmo manifesto. Nenhum desses passos escreve no banco.

## Artefatos operacionais

- Contrato de estados: migration `20260810120000` e rollback pareado.
- Carga global: migration `20260810121000` e rollback pareado, com preflight
  fail-closed da cardinalidade e do drift do universo.
- Readback SQL: `20260810121000_financiamento_reconciliado_universo.readback.sql`.
- Readback banco, API/DTO e DOM reais das 194 fichas:
  `PF_PUBLIC_SITE_URL=<url-do-mesmo-sha> npm run audit:financiamento:readback`.
  O comando falha se a view persistida estiver indisponivel, se a API nao
  responder com fonte live, se qualquer payload divergir ou se a aba Dinheiro
  nao materializar o estado esperado no navegador.

Os artefatos estao preparados, mas nenhuma migration foi aplicada. O estado so
fica verde depois de aplicacao autorizada, deploy do mesmo SHA e readback
publico.
