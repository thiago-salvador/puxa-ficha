# Cobertura de pesquisas para governos em 19 UFs

Data de corte: 26 de agosto de 2026.

## Resultado

A busca publicou 8 UFs e 37 perfis adicionais. O catálogo passou de 8 para 16 UFs e de 60 para 97 perfis. A cobertura das 21 UFs do inventário passou de 2 para 10 UFs publicadas. O resultado não promete 27 de 27 porque 11 UFs do inventário continuam sem evidência suficiente.

| UF | Estado final | Rodada principal ou bloqueio |
| --- | --- | --- |
| AC | condicional | Atlas `AC-07815/2026`; falta trilha pública de correções da fonte |
| AL | condicional | Quaest `AL-05503/2026`; condição de correções não resolvida |
| AM | publicada | Real Time Big Data `AM-09965/2026` |
| AP | sem resultado público verificável | Real Time Big Data `AP-02970/2026`; a divulgação declara que o método não foi informado |
| BA | publicada | Real Time Big Data `BA-00277/2026`, cenário 1, com zero real preservado |
| ES | sem resultado público verificável | Real Time Big Data `ES-05096/2026` ainda sem resultado público no corte |
| GO | condicional | Quaest `GO-01701/2026` condicional; Real Time Big Data `GO-00954/2026` ainda em campo |
| MA | sem resultado público verificável | Real Time Big Data `MA-04311/2026` omite Saulo Arcangeli, presente no registro definitivo |
| MS | publicada | Real Time Big Data `MS-07706/2026` |
| MT | publicada | Real Time Big Data `MT-04560/2026`, com zero real de Maurício Coelho preservado |
| PA | condicional | Atlas `PA-04533/2026` e Quaest; falta trilha pública de correções aprovada |
| PB | publicada | Real Time Big Data `PB-07790/2026`; amostra de 1.600 confirmada em duas divulgações |
| PR | publicada | Real Time Big Data `PR-09262/2026` |
| RN | condicional | Atlas `RN-04754/2026`; falta trilha pública de correções da fonte |
| RO | publicada | Real Time Big Data `RO-04369/2026`, com zero publicado preservado |
| RR | sem fonte qualificada | Nenhuma rodada de fonte aprovada passou pelos gates |
| SC | condicional | Quaest `SC-00517/2026`; condição de correções não resolvida |
| SE | publicada | Real Time Big Data `SE-07327/2026` |
| TO | sem resultado público verificável | A divulgação cita `TO-09655/2026`, mas a consulta direta ao PesqEle encontra somente `TO-09665/2026` para a Real Time Big Data no Tocantins |

## Fontes e método de decisão

A busca consultou o PesqEle, o conjunto de dados abertos de pesquisas eleitorais de 2026, as páginas públicas de Datafolha, AtlasIntel e Ipsos-Ipec, o scorecard já aprovado de Real Time Big Data e divulgações jornalísticas permanentes. O relatório de deep research serviu apenas como pista de descoberta.

O registro no TSE foi tratado como metadado declarado, nunca como aprovação. Cada publicação exigiu resultado público, período de campo, amostra, margem, confiança, método, cenário, URL verificável, fonte aprovada e alias literal para perfil de candidato a Governador da mesma UF. Resultado sem perfil resolvido permaneceu `indeterminado`, e ausência não virou zero.

Fontes principais: [PesqEle](https://pesqele-divulgacao.tse.jus.br/app/pesquisa/listar.xhtml), [dados abertos do TSE](https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026), [biblioteca pública da AtlasIntel](https://www.atlasintel.org/polls/exclusive-polls), [Ipsos Eleições](https://www.ipsos.com/pt-br/topic/eleicoes), [Real Time Big Data no R7](https://noticias.r7.com/eleicoes/2026/) e as URLs por UF preservadas no inventário versionado.

## Decisões adversariais

- Amapá ficou vazio porque reputação do instituto não preenche método ausente.
- Maranhão ficou vazio porque uma rodada anterior não pode substituir o cenário definitivo que inclui candidato omitido.
- Tocantins ficou vazio porque o vínculo entre resultado e registro não ficou inequívoco.
- AtlasIntel e Quaest ficaram condicionais porque a lacuna concreta de correções públicas não foi resolvida.
- Bahia e Mato Grosso preservam percentuais de 0 publicados, sem converter ausência em zero.
