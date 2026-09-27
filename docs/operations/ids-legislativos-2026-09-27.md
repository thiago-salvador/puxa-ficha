# IDs legislativos conferidos em 27/09/2026

Leitura direta das APIs oficiais, sem inferir identidade por semelhança de nome:

| Pessoa | Casa | ID | Fonte oficial | Estado no seed |
| --- | --- | ---: | --- | --- |
| Aécio Neves | Senado | 391 | [Senado](https://legis.senado.leg.br/dadosabertos/senador/391.json) | `aecio-neves`: ID incluído no PR #533; evitar alteração duplicada |
| Eduardo Braga | Câmara | 133917 | [Câmara](https://dadosabertos.camara.leg.br/api/v2/deputados/133917) | `eduardo-braga`: ID incluído |
| Eduardo Paes | Câmara | 74683 | [Câmara](https://dadosabertos.camara.leg.br/api/v2/deputados/74683) | `eduardo-paes`: ID incluído |
| Álvaro Dias (RN) | Câmara | 74036 | [Câmara](https://dadosabertos.camara.leg.br/api/v2/deputados/74036) | `alvaro-dias-rn`: ID incluído |
| ACM Neto | Câmara | 74058 | [Câmara](https://dadosabertos.camara.leg.br/api/v2/deputados/74058) | `acm-neto`: ID já presente |
| José Roberto Arruda | Câmara | 74287 | [Câmara](https://dadosabertos.camara.leg.br/api/v2/deputados/74287) | `jose-roberto-arruda`: ID já presente |
| Jair Bolsonaro | Câmara | 74847 | [Câmara](https://dadosabertos.camara.leg.br/api/v2/deputados/74847) | sem candidato correspondente no seed; não atribuir a outro Bolsonaro |
| Carlos Brandão | Câmara | 141402 | [Câmara](https://dadosabertos.camara.leg.br/api/v2/deputados/141402) | sem candidato correspondente no seed; não atribuir a Orleans Brandão |

As respostas oficiais retornaram HTTP 200 e os nomes indicados nesta tabela. Um ID histórico identifica a pessoa na casa, mas não prova por si só um mandato atual nem a cobertura completa das votações. A matriz de cobertura deve continuar exigindo recibo por casa e prova de leitura das linhas públicas.
