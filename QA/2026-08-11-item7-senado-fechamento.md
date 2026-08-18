# Item 7, fechamento local do Senado por votação exata

Estado: **implementado e provado localmente; não aplicado, não implantado e sem readback público**.

## Universo medido

Leitura direta e somente leitura de produção em 11/08/2026:

| | Antes | Proposta local |
|---|---:|---:|
| Linhas de `votacoes_chave` do Senado | 13 | 6 |
| Pares em `votos_candidato` | 81 | 75 |
| Linhas com `CodigoSessaoVotacao` exato | 0 | 6 |
| Matcher por `Materia.Codigo` | 13 | 0 |

O recibo nominal completo está em
`QA/evidencias/2026-08-11-item7-senado/auditoria-oficial-13-linhas.json`.
Ele exige resposta dos 28 IDs do Senado do universo de candidatos, valida
matéria, data, descrição e evento, e retém somente `Sim`, `Não`, abstenção e
obstrução. Falha de qualquer endpoint aborta o recibo.

## Resultado das 13 linhas

Mantidas com evento oficial exato:

| Evento | Matéria | Data da sessão | Pares |
|---|---|---|---:|
| `6046` | PEC 6/2019, Previdência, segundo turno | 22/10/2019 | 10 |
| `6248` | PLP 19/2019, autonomia do BC, substitutivo | 03/11/2020 | 10 |
| `6377` | MPV 1031/2021, mérito da Eletrobras | 16/06/2021 | 10 |
| `6714` | PLP 93/2023, arcabouço fiscal | 21/06/2023 | 16 |
| `6756` | PL 2903/2023, marco temporal | 27/09/2023 | 14 |
| `6777` | PEC 45/2019, reforma tributária, segundo turno | 08/11/2023 | 15 |

Retiradas fail-closed:

- Código Florestal: a linha usava a data da sanção e atribuía voto do Senado a
  Ronaldo Caiado quando ele ainda era deputado.
- Impeachment: `proposicao_id=126084` identifica PLC 27/2016, não a DEN 1/2016;
  os nove pares não provavam o quesito final de 31/08/2016.
- Teto de Gastos e Marco Legal da IA: não há evento nominal endereçável no
  endpoint oficial usado pelo ingest; zero não foi inventado.
- Marco Temporal e Reforma Tributária: uma duplicata de cada foi retirada. No
  Marco Temporal, o único `sim` legado era `AP` na fonte oficial.
- Ofício 25/2023, CNJ: evento `6809` é escrutínio secreto. A fonte publica
  `Votou`, sem polaridade; o matcher antigo transformava isso em `sim`.

Fontes oficiais por evento:
`https://legis.senado.leg.br/dadosabertos/senador/{codigo}/votacoes.json` e
`https://www25.senado.leg.br/web/atividade/materias/-/materia/{codigo}`.

## Correção global

`scripts/lib/ingest-senado.ts` agora:

1. lê todas as linhas do Senado e exige `fonte=senado` mais
   `votacao_id_api=CodigoSessaoVotacao`;
2. recusa linha legada sem chave, sem voltar a `proposicao_id`;
3. casa somente o evento exato, mesmo que a matéria tenha várias rodadas;
4. nunca converte `Votou`, presença sem voto, licença ou ausência em `sim` ou
   `ausente`;
5. propaga falha de select, fonte e upsert em `IngestResult.errors`.

A migration de dados `20260811100000_votacoes_senado_chave_exata.sql` reseta os
81 pares legados, retira as sete linhas sem contrato publicável, corrige as seis
chaves e datas, e carrega os 75 pares auditados. A migration de contrato
`20260811100100_votacoes_senado_contrato_exato.sql` impede que uma nova linha do
Senado seja persistida sem `votacao_id_api`. Os rollbacks restauram byte a byte
as 13 linhas e os 81 pares do snapshot e removem o contrato. O readback mede 6,
75 e zero voto fora do vocabulário nominal.

## Provas locais

- Auditoria oficial: 28/28 endpoints, 6 eventos, 75 pares.
- Teste adversarial: matéria igual com rodada diferente não casa.
- Teste adversarial: `Votou` secreto não vira `sim`.
- Teste adversarial: `P-NRV` não fabrica `ausente`.
- Falhas de banco, rede, duplicidade de evento e upsert são explícitas.
- O caminho banco, DTO, API e DOM permanece o compartilhado e já coberto por
  `src/lib/api.ts` e `src/components/CandidatoProfile.tsx`; a mudança elimina a
  ambiguidade antes da persistência, sem criar um caminho especial por ficha.

## Ato externo ainda necessário

Depois da integração e autorização nominal: aplicar as migrations no mesmo SHA,
implantar esse SHA e executar o readback público. Até isso ocorrer, o item não é
verde de release.
