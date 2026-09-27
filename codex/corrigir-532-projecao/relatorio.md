# PR #532: projeção de aplicação e revisão dos 1.576 alvos

Data da análise: 27/09/2026. Escopo: dry-run local, snapshot público de 512 fichas, pacotes oficiais TSE com SHA-256 no manifesto privado, plano do escritor auditado e recibos de cobertura. Nenhuma escrita em produção foi feita.

## Resultado por fonte

| Fonte e família | Alvos | Fechadas no dry-run | Fechariam após escrita segura projetada | Vazio 2026 já provado | Revisão de identidade | Revisão de escopo/regra | Fonte corrige dado publicado, sem fechamento projetado |
|---|---:|---:|---:|---:|---:|---:|---:|
| `tse-financiamento` | 512 | 0 | 0 | 0 | 91 | 0 | 421 |
| `tse-historico` | 505 | 217 | 0 | 0 | 75 | 0 | 213 |
| `tse-patrimonio` | 512 | 105 | 0 | 50 | 79 | 7 fora da série | 271 |
| `tse-partido-candidatura` | 47 | 36 | 0 | 0 | 2 | 9 transições | 0 |
| **Total** | **1.576** | **358** | **0** | **50** | **247 células** | **16** | **905** |

As 36 novas fechadas da última linha incluem 30 recibos `vazio_confirmado` porque a ficha não publica transição entre as candidaturas oficiais e 6 recibos `encontrado`. Antes desta revisão, o baseline era 322 fechadas. As categorias são exclusivas por célula; as 247 células de identidade pertencem a 91 perfis únicos. Há ainda 9 divergências partidárias de regra, totalizando **914** células com fonte oficial ou sequência conhecida, mas sem fechamento por aplicação nesta rodada. A classificação individual, motivo e ações projetadas estão em [`classificacao-celulas.json`](./classificacao-celulas.json). Os 1.576 pares `slug|família` foram deduplicados e reconciliados com a lista de alvos anterior.

## O que a projeção simula

O planejador aplica em memória as ações **que o escritor auditado de finanças de 2026 realmente planejou**, respeitando slug, ano, unicidade da linha e pré-imagem. Em seguida recompõe o recibo com o mesmo pacote oficial e compara a ficha simulada com o readback. A projeção de patrimônio e financiamento está em [`collect-tse-family-receipts-local.ts`](../../scripts/audit/collect-tse-family-receipts-local.ts) e a classificação por célula em [`ingest-tse-local.ts`](../../scripts/tse-local/ingest-tse-local.ts). Cada alvo expõe `writer_actions`, `writer_status` e `post_write_readback_matches`; `null` significa que não houve projeção, e `false` que a comparação pós-escrita foi feita e não fechou. O plano auditado contém 101 atualizações e 2 inserções de financiamento, 1 inserção de patrimônio, 1 remoção de verificação e 1 remoção de ausência patrimonial; 20 patrimônios divergentes são expressamente enviados a revisão pelo escritor. A simulação privada tem 998 entradas de família. Em 82 células ainda divergentes há alguma ação aplicável (81 financiamento, 1 patrimônio), mas **nenhuma** satisfaz o recibo completo depois da aplicação simulada.

O motivo técnico mais frequente é diferença entre a informação que o escritor atual publica e a exigência do comparador de família inteira. Nas 98 atualizações de financiamento examinadas, `categorias_origem` do readback publicado é nulo; o escritor atual altera totais e maiores doadores, mas não publica essa decomposição. O comparador exige categorias e todas as linhas de doadores oficiais em [`collect-tse-family-receipts-local.ts`](../../scripts/audit/collect-tse-family-receipts-local.ts). Assim, uma fonte correta e uma atualização auditada não bastam para afirmar que a cobertura estaria fechada. O histórico político divergente também não tem escritor de dados de ficha neste fluxo; o plano só gera recibos. **“Fonte corrige dado publicado” não é autorização nem prova de escrita segura ou de fechamento.** Os 905 casos da última coluna ficam abertos para adequação do escritor e nova projeção; não são falhas da fonte TSE.

Motivo dos 905 ainda abertos dessa classe: 421 de financiamento (81 com ação do escritor, porém comparação posterior ainda falha; 340 sem ação aplicável), 213 de histórico político (sem escritor de dados da ficha neste fluxo) e 271 de patrimônio (uma inserção planejada que não fecha a família completa; as demais não são reescritas pelo escritor auditado). Portanto, a coluna “fechariam após escrita segura” é zero, mesmo com fonte oficial disponível. Os 9 partidários da coluna de regra não são empurrados para essa classe.

## Patrimônio: 2026 e anos anteriores

As 50 candidaturas têm `status=ok`, `bens=[]` e `totalDeBens=0` no detalhe oficial de 2026. No snapshot público, a série `patrimonio_eleicoes` **já** marca 2026 como `vazio_confirmado` e contém URL TSE; não há linha de patrimônio bruto de 2026 nesses perfis. Sete fichas preservam bens de anos anteriores e 43 não têm linha bruta de patrimônio. A alegada contradição do relatório anterior comparava a família inteira com uma ausência de **2026**. A regra do produto compõe a série por ano a partir de bens e ausências oficiais em [`api.ts`](../../src/lib/api.ts) (linhas 1889–1912) e dá precedência ao estado anual `vazio_confirmado` quando não há bem publicado naquele ano em [`public-profile-dto.ts`](../../src/lib/public-profile-dto.ts) (linhas 194–274). A mensagem pública (linhas 142–156 do mesmo DTO) deixa claro que ausência de registro no arquivo não prova ausência de patrimônio nem a intenção declaratória. Cada uma das 50 células traz a URL de detalhe TSE em `proof_url` na classificação.

Para 2002 e 2004, o catálogo oficial [Candidatos 2002](https://dadosabertos.tse.jus.br/dataset/candidatos-2002) e [Candidatos 2004](https://dadosabertos.tse.jus.br/dataset/candidatos-2004) não lista recurso de bens. Os URLs `bem_candidato_<ano>.zip` exibiram 404 no navegador headful; `curl` retornou 403 no ambiente, logo não tratamos o status do origin como confirmado por duas superfícies. A série suportada começa em 2006 em [`public-profile-dto.ts`](../../src/lib/public-profile-dto.ts). Sete células antigas ficam **fora da série oficial disponível**, sem fabricar `vazio_confirmado` individual. A evidência está em [`bens-antigos.md`](./bens-antigos.md).

## Identidade e SQ 2026

Os 21 perfis sem SQ 2026 curado foram pesquisados nas listas oficiais de candidaturas de 2026 por nome, UF e cargo, com conferência do ZIP `consulta_cand_2026` de SHA-256 `0c99ac82ed450940aa1d6dbacb6842b4a90912645ed8ecb3d411aff1a75c46b5` e contexto headful. Há 21 propostas de SQ distintos em [`propostas.json`](../corrigir-532-identidade/propostas.json), **sem promoção ao seed**. Cinco probabilidades Jev estão na faixa inclusiva 0,35–0,65: `ataides-oliveira`, `augusto-cury`, `camila-falcao`, `gabriel-azevedo` e `ricardo-cappelli`; todas seguem a revisão humana. Os outros 16 também são propostas, nunca promoção automática.

O conjunto conservador de risco contém 91 perfis únicos, somando âncoras históricas conflitantes, falta de SQ curado, UF incerta e patrimônios divergentes que o escritor preserva para revisão. [`revisao-divergencias.json`](../corrigir-532-identidade/revisao-divergencias.json) registra o estado sem CPF, o julgamento Jev Noul “mesma pessoa?” por candidato, lint das perguntas e a fila de revisão. Probabilidades não são identidade comprovada nem calibração de acurácia; 32 avaliações ficaram na faixa cinzenta. Nenhuma célula de identidade entra em ação segura projetada. Nenhum CPF é armazenado ou emitido nestes artefatos.

## Partido em cada candidatura

O novo recibo `tse-partido-candidatura` certifica a legenda que consta de cada candidatura oficial, sem atribuir **data de filiação**. O plano de cobertura independente aprovou 36/47: 30 sem transição pública a contradizer a sequência oficial e 6 com transição derivável. Onze transições publicadas não derivam da sequência oficial; duas também estão na revisão de identidade e nove ficam em revisão de regra/escopo. Essas onze não foram fechadas por aproximação nominal. Filiação datada permanece no coletor Câmara/Senado do PR #533. Prova privada: `projecao-532-partido-recibos-47.json` e `projecao-532-party-plan/plano-cobertura-dry-run.json` no diretório de evidências desta análise.

## Verificação e fronteira

Os testes herméticos cobrem simulação de escrita, bloqueio de identidade, vazio anual, classificação de escopo partidário e validação do recibo. O gate final, o SHA do commit remoto e o readback do corpo do PR são registrados no relatório privado `projecao-532.report.md` após a execução. Não houve escrita em produção, merge, dispatch ou instalação de launchd.
