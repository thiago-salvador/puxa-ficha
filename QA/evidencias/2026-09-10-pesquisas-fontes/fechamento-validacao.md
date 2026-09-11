# Recuperação das seis fichas sem percentual

Referência: 10/09/2026. Cinco lacunas recuperadas; uma permanece sem resultado individual verificável. Dados integrados e conferidos localmente na branch `codex/pesquisas-fontes-semanais`, PR #304 em rascunho. Publicação em produção não realizada.

| Candidato | UF | Percentual estimulado | Instituto | Divulgação | Registro |
|---|---|---|---|---|---|
| Maria Bona | BA | 0,5% em dois cenários | Paraná Pesquisas | 27/08/2026 | BA-07628/2026 |
| Expedito Mendonça | DF | 0,8% | IGAPE | 06/09/2026 | DF-07879/2026 |
| Dimas Cassimiro | MA | 0,4% | Doxa Pesquisa | 10/09/2026 | MA-04033/2026 |
| Reginaldo Lima | MA | 0,7% | Doxa Pesquisa | 10/09/2026 | MA-04033/2026 |
| Saulo Arcangeli | MA | 0,3% | Doxa Pesquisa | 10/09/2026 | MA-04033/2026 |

Foram incorporadas três pesquisas completas de intenção de voto, com 64 linhas em oito cenários. Espontânea e segundo turno continuam separados; as fichas selecionam os cenários estimulados de primeiro turno. Os nomes de Elisson Ferreira e Samara Mineiro também foram conciliados com a relação oficial do TRE-DF.

## Fontes e evidências

- BA: [relatório original do Paraná Pesquisas](https://paranapesquisas.com.br/wp-content/uploads/2026/08/BA_Ago26-1.pdf). Transcrição em `fechamento-BA-parana-BA-07628-2026.txt`.
- DF: [tabela do Metrópoles](https://www.metropoles.com/distrito-federal/igape-celina-lidera-com-365-arruda-tem-207-e-grass-soma-138). Transcrição em `fechamento-DF-igape-DF-07879-2026.txt`; identidades em `fechamento-DF-identidades.json`.
- MA: [publicação do próprio Doxa](https://www.pesquisasdoxa.com/post/eleicoes-2026-pesquisa-doxa-aponta-disputa-acirrada-entre-orleans-brandao-e-eduardo-braide). Os gráficos foram abertos e lidos visualmente; URLs e transcrição em `fechamento-MA-fontes.txt`. O método de coleta não informado continua indeterminado.
- Manifesto das rodadas integradas e hashes: `nominal-fechamento-manifesto.json`.
- Tentativas: 33 registros de busca nas frentes BA/DF/MA em `fechamento-buscas-integradas.json`, mais 36 consultas Google para PA em `fechamento-PA-buscas.json`. Consultas compartilhadas não equivalem a 69 pesquisas eleitorais.

## Pendência de Ruth Reis

A busca percorreu os 14 tipos de caminho do roteiro, incluindo nome civil, nome de urna, veículos, institutos, registros, tabelas, PDFs, agrupamentos e histórico. Não foi confirmado percentual individual de Ruth Reis.

O [relatório Real Time Big Data PA-00206/2026, página 7](https://static.poder360.com.br/uploads/2026/09/pesquisa-realtime-para.pdf) identifica José Moita, Well Macedo e Gal Leite no total agrupado de 1%. A [publicação EPOL/Simetria](https://estadodoparaonline.com/pesquisa-epol-simetria-aponta-empate-tecnico-entre-hana-ghassan-e-dr-daniel-na-disputa-pelo-governo-do-para/) informa que Ruth substituiu José Moita no fim da coleta e não teve o nome testado. Trechos de buscadores e agregadores que sugerem valor para Ruth não substituem a fonte original.

Ela permanece na fila da rotina semanal. A conclusão é ausência de evidência individual nas fontes verificadas, não inexistência universal de pesquisa.

## Cobertura medida após a integração

- Cadastro ativo: 206 candidatos, 13 à Presidência e 193 a governos estaduais/DF.
- Com resultado individual selecionado na ficha: 205, sendo 13 presidenciais e 192 estaduais.
- Com pelo menos um resultado divulgado nos últimos 14 dias: 190.
- Somente histórico anterior a 27/08: 15, sendo seis em RO, oito em SC e Cesar Pontes no RS. Os nomes estão em `scripts/data/pesquisas-busca-semanal.json` e retornam à fila de atualização recente.
- Sem percentual individual: Ruth Reis, PA.
- Catálogos completos: 57 pesquisas. Esta PR acrescenta 40 pesquisas e 564 linhas brutas, com vínculos a 205 fichas ativas.

## Verificação

- `npm run verify:pesquisas`: PASS, 68 testes, build, sete testes de navegador, lint, ortografia, typecheck e checagem de scripts. As cinco fichas recuperadas foram abertas no navegador; capturas de Dimas e Maria foram inspecionadas visualmente.
- Após conciliar os dois nomes do DF: `npm run test:pesquisas`: PASS, 68 testes; `npm run audit:pesquisas:gate`: PASS, 57 pesquisas, 27 UFs e 192 perfis estaduais.
- `npm run test:pesquisas:monitoramento`: PASS, 11 testes.
- Comparação semântica: nenhuma das 52 pesquisas estaduais anteriores foi alterada pela adição das três rodadas.
- Logs locais: `/private/tmp/pf-fechamento-verify.log`, `/private/tmp/pf-fechamento-test-final.log`, `/private/tmp/pf-fechamento-monitor.log`.
- Capturas de navegador: `test-results/pesquisas-eleitorais-busca-24865-as-cinco-fichas-recuperadas-chrome/`.

O roteiro passou a exigir leitura visual quando a tabela estiver em imagem ou PDF. A automação existente continua às segundas e quintas, 9h de São Paulo, no Codex local. O resultado desta execução é `local_verified_pending_publication`; busca, integração e versão pública permanecem registradas separadamente.

Registro de execução: [confidence: alta, source: fontes vinculadas, catálogos e comandos de verificação desta execução] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
