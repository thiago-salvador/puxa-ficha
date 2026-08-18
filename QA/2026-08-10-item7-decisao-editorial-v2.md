# Item 7: decisão editorial v2, aprovada

**Status: aprovada pelo Thiago em 10/08/2026**, com uma alteração posterior
medida na implementação e registrada na seção "Alteração pós-aprovação".

Revisão das 18 recomendações anteriores, que virou a base do dataset v2.

## Régua objetiva que passei a aplicar

O critério "votação quase unânime não vira votação-chave" estava declarado mas
não tinha limiar, e por isso eu o aplicava de forma inconsistente. Fixo agora:

> **Uma votação só entra se a minoria tiver ao menos 10% dos votos nominais**
> (`min(sim, não) / (sim + não)`).

Abaixo disso a votação não separa candidatos, que é a única função dela numa
ficha. Aplicado a todas as 18, sem exceção.

E uma segunda régua, para escolher a rodada:

> **A rodada representativa é a que decide a matéria que o rótulo anuncia**, não
> a de maior participação. Em PEC com dois turnos, é o segundo, que conclui a
> aprovação na Casa. Em projeto, é a rodada que aprova o texto como um todo
> (substitutivo, projeto ou dispositivos do Senado). Rodada que decide artigo
> isolado ou emenda cujo conteúdo não está na descrição oficial não representa a
> matéria.

## 1. Reavaliação explícita das três quase unânimes

| Matéria | Placar | Minoria | Decisão |
|---|---|---|---|
| PL 3855/2019, medidas contra a corrupção | 450 x 1 | **0,2%** | **RETIRADA** da lista pronta |
| REP 1/2015, cassação de Eduardo Cunha | 450 x 10 | **2,2%** | **RETIRADA** |
| PEC 221/2019, jornada de 36 horas | 472 x 22 | **4,5%** | **RETIRADA** |

Nenhuma exceção registrada, e explico por quê em cada caso.

**REP 1/2015.** Na rodada anterior eu escrevi que "a minoria de 10 é justamente o
dado informativo". Isso não é critério objetivo, é justificativa construída
depois da escolha. Uma votação em que 450 de 460 votam igual não diferencia 450
candidatos, e a ficha existe para diferenciar. A cassação continua sendo um
marco da legislatura; ela é matéria de linha do tempo, não de votação-chave.

**PEC 221/2019.** É a perda editorial mais custosa, e mesmo assim retiro. Os dois
turnos são 472x22 e 461x19, minoria de 4,5% e 4,0%. Publicar "votou a favor da
redução da jornada" para 472 deputados não informa nada sobre nenhum deles. Se
você quiser mantê-la assim mesmo, a exceção precisa ser sua e nomeada, e eu a
registro como exceção editorial explícita no dataset.

**PL 3855/2019.** Reprova nas duas réguas ao mesmo tempo, e por isso vai para
PENDENTE em vez de RETIRADA: ver seção 3.

## 2. Lista PRONTA, 13 matérias, sem ressalvas

Casa e fonte em todas: **Câmara dos Deputados, Câmara Dados Abertos v2**. Link
de auditoria: `https://dadosabertos.camara.leg.br/api/v2/votacoes/{id}/votos`.

### 55ª legislatura, 4

**1. Denúncia criminal contra o presidente Michel Temer**
- `votacao_id_api`: `2143164-138` · Data: 02/08/2017 · Placar: 263 x 227 (minoria 46,3%)
- Descrição oficial integral: "Aprovado o Parecer da Comissão de Constituição e Justiça e de Cidadania que conclui pelo indeferimento da solicitação de autorização para a instauração, pelo Supremo Tribunal Federal, de processo criminal em razão de denúncia formulada pelo Ministério Público Federal em desfavor do Excelentíssimo Senhor Presidente da República, Michel Miguel Elias Temer Lulia, nos autos do Inquérito nº 4.517. Sim: 263; Não: 227; Abstenção: 2; Total: 492. Ausentes: 19."
- Por que representa o rótulo: rodada única da matéria e a que decidiu o objeto inteiro. **Atenção ao rótulo: SIM significa barrar o processo contra o presidente, não autorizá-lo.** O rótulo da ficha precisa dizer isso, senão inverte o sentido do voto.

**2. Redução da maioridade penal**
- `votacao_id_api`: `14493-503` · Data: 01/07/2015 · Placar: 323 x 155 (minoria 32,4%)
- Descrição oficial integral: "Aprovada a Emenda Aglutinativa nº 16. Sim: 323; não: 155; abstenção: 2; total: 480."
- Por que representa o rótulo: é a rodada que **aprovou** a redução em primeiro turno, revertendo a rejeição da véspera (30/06/2015, `14493-442`, 303x184, em que o substitutivo caiu por não alcançar 308 votos). SIM é a favor da redução nas duas rodadas; escolhi esta porque é a que produziu efeito. Existe um segundo registro do mesmo evento sob outra proposição (`1549085-2`, mesmo placar e mesma data); adotei a regra de ficar com o id ancorado na proposição da própria matéria.

**3. Vaquejada e práticas desportivas com animais (PEC 304/2017)**
- `votacao_id_api`: `2123843-93` · Data: 31/05/2017 · Placar: 373 x 50 (minoria 11,8%)
- Descrição oficial integral: "Aprovada, em segundo turno, a Proposta de Emenda à Constituição n° 304, de 2017. Sim: 373; não: 50; abstenção: 6; Total: 429."
- Por que representa o rótulo: segundo turno, que conclui a aprovação da PEC na Câmara. É a matéria mais perto do limiar de 10%, e fica registrado.

**4. Criação da Comissão da Mulher, do Idoso, da Criança, do Adolescente, da Juventude e Minorias (PRC 8/2007)**
- `votacao_id_api`: `340812-195` · Data: 27/04/2016 · Placar: 221 x 167 (minoria 43,0%)
- Descrição oficial integral: "Aprovado o Substitutivo adotado pela Mesa Diretora ao Projeto de Resolução nº 8 de 2007. Sim: 221; não: 167; abstenção: 1; total: 388."
- Por que representa o rótulo: única das 4 rodadas que decide o Projeto de Resolução como um todo; as outras três são "Mantido o texto" sobre trechos destacados.

### 57ª legislatura, 9

**5. Prerrogativas parlamentares (PEC 3/2021)**
- `votacao_id_api`: `2270800-135` · Data: 16/09/2025 · Placar: 353 x 134 (minoria 27,5%)
- Descrição oficial integral: "Aprovado, em primeiro turno, o Substitutivo Reformulado à Proposta de Emenda à Constituição nº 3, de 2021, adotado pelo Relator da Comissão Especial. Sim: 353; Não: 134; Abstenção: 1; Total: 488."
- Por que representa o rótulo: única das 4 rodadas que aprova o texto da PEC como um todo; as outras três são "Mantido o texto" e "Suprimido o texto" sobre trechos. Não há votação de segundo turno no conjunto elegível.

**6. Sustação do Decreto 12.466/2025 (PDL 214/2025)**
- `votacao_id_api`: `2515648-44` · Data: 25/06/2025 · Placar: 383 x 98 (minoria 20,4%)
- Descrição oficial integral: "Aprovado o Substitutivo ao Projeto de Decreto Legislativo nº 214, de 2025, adotado pelo relator da Comissão de Constituição e Justiça e de Cidadania. Sim: 383; Não: 98; Total: 481."
- Por que representa o rótulo: rodada única, e aprova o decreto legislativo que susta o ato do Executivo.

**7. Imunidade tributária de templos e entidades (PEC 5/2023)**
- `votacao_id_api`: `2351506-122` · Data: 28/05/2026 · Placar: 368 x 96 (minoria 20,7%)
- Descrição oficial integral: "Aprovada, em segundo turno, a Proposta de Emenda à Constituição n° 5, de 2023. Sim: 368; Não: 96; Abstenção: 7; Total: 471."
- Por que representa o rótulo: segundo turno, que conclui a aprovação na Câmara. Troquei do primeiro turno pela régua de PEC.

**8. Número de deputados por estado (PLP 177/2023)**
- `votacao_id_api`: `2383019-54` · Data: 06/05/2025 · Placar: 270 x 207 (minoria 43,4%)
- Descrição oficial integral: "Aprovado o Substitutivo ao Projeto de Lei Complementar nº 177, de 2023, adotado pelo relator da Comissão de Finanças e Tributação. Sim: 270; Não: 207; Abstenção: 1; Total: 478."
- Por que representa o rótulo: é a rodada em que a Câmara decide o próprio texto. A outra rodada (25/06/2025, `2383019-91`, 361x36) apenas acata emendas do Senado e teria minoria de 9,1%, abaixo do limiar.

**9. Contenção de despesas e regime fiscal (PLP 210/2024)**
- `votacao_id_api`: `2473389-58` · Data: 17/12/2024 · Placar: 318 x 149 (minoria 31,9%)
- Descrição oficial integral: "Aprovado o Substitutivo ao Projeto de Lei Complementar nº 210, de 2024, adotado pelo relator da Comissão Especial. Sim: 318; Não: 149; Total: 467."
- Por que representa o rótulo: única das 5 rodadas que aprova o texto como um todo; as outras são três emendas de plenário rejeitadas e uma emenda aglutinativa de 444x16.

**10. Sustação de ação penal em curso (SAP 1/2025)**
- `votacao_id_api`: `2494565-52` · Data: 07/05/2025 · Placar: 315 x 143 (minoria 31,2%)
- Descrição oficial integral: "Aprovado o parecer da Comissão de Constituição e Justiça e de Cidadania à Sustação de Andamento de Ação Penal nº 1, de 2025, pela sustação do andamento da Ação Penal. . Sim: 315; Não: 143; Abstenção: 4; Total: 462."
- Por que representa o rótulo: rodada única. **SIM significa suspender o processo criminal**, e o rótulo tem de dizer isso.

**11. Regulamentação da reforma tributária, IBS e CBS (PLP 68/2024)**
- `votacao_id_api`: `2430143-140` · Data: 17/12/2024 · Placar: 324 x 123 (minoria 27,5%)
- Descrição oficial integral: "Aprovados os dispositivos do Substitutivo do Senado Federal ao Projeto de Lei Complementar nº 68, de 2024, com parecer pela aprovação. Sim: 324; Não: 123; Abstenção: 3; Total: 450."
- Por que representa o rótulo: é a decisão final da Câmara sobre o texto da regulamentação. As rodadas de 10/07/2024 são emendas isoladas, e a de 17/12 com 477x3 não distinguiria.

**12. Incentivo à permanência no ensino médio (PLP 243/2023)**
- `votacao_id_api`: `2409076-34` · Data: 13/12/2023 · Placar: 370 x 77 (minoria 17,2%)
- Descrição oficial integral: "Aprovado o Projeto de Lei Complementar nº 243, de 2023. Sim: 370; não: 77; abstenção: 4; total: 451."
- Por que representa o rótulo: rodada única e aprova o projeto inteiro, nomeado na descrição.

**13. Silvicultura e licenciamento ambiental (PL 1366/2022)**
- `votacao_id_api`: `2324721-94` · Data: 08/05/2024 · Placar: 309 x 131 (minoria 29,8%)
- Descrição oficial integral: "Aprovado o Projeto de Lei nº 1.366, de 2022. Sim: 309; não: 131; abstenção: 2; total: 442."
- Por que representa o rótulo: rodada única e aprova o projeto inteiro. **SIM significa excluir a silvicultura do rol de atividades potencialmente poluidoras.**

## 3. Lista PENDENTE, 3 matérias, com bloqueio exato

**PEC 182/2007, reforma política e fidelidade partidária**
- Bloqueio: **nenhuma das 20 rodadas decide a matéria como um todo.** Todas decidem fragmentos, artigos isolados do substitutivo e emendas aglutinativas numeradas, e não existe votação de turno da PEC no conjunto elegível. A rodada que eu havia fixado (`373327-143`, 210x267) é "Rejeitado o artigo 1º do Substitutivo", ou seja, decide um artigo, não a reforma.
- Para destravar: você define qual fragmento vira a votação-chave, e o rótulo da ficha passa a nomear o fragmento, não a reforma inteira.

**PL 3855/2019, medidas contra a corrupção (as 10 Medidas)**
- Bloqueio duplo. A única rodada com rótulo claro (`2080604-354`, "Aprovado o Substitutivo adotado pela Comissão Especial") é 450x1, minoria de 0,2%, e reprova no limiar. As rodadas que de fato decidiram o conteúdo, na madrugada de 30/11/2016, são dez votações de "Suprimido o texto" e três de "Aprovada a Emenda nº X", **e a descrição oficial não diz o que foi suprimido nem o que cada emenda continha**.
- Para destravar: leitura documental fora da API (avulso de cada emenda e o que cada supressão retirou). Sem isso, qualquer rótulo seria invenção.

**PL 5587/2016, transporte por aplicativo**
- Bloqueio: as 4 rodadas decidem artigos e emendas específicos ("Aprovado o art. 2º da Emenda Substitutiva nº 1, em substituição ao art. 2º do substitutivo do relator"; "Aprovado o art. 12-D da Lei 12.587/12"), e nenhuma aprova o projeto. Rotular qualquer uma como "regulamentação do transporte por aplicativo" exigiria saber o conteúdo de cada artigo, que não está na descrição.
- Para destravar: mesma leitura documental.

## 4. Diferenças em relação às 18 recomendações anteriores

| Matéria | Antes | Agora | Motivo |
|---|---|---|---|
| REP 1/2015, cassação de Cunha | ENTRAR | **RETIRADA** | Minoria de 2,2%. A justificativa anterior era exceção construída depois da escolha. |
| PEC 221/2019, jornada de 36h | ENTRAR | **RETIRADA** | Minoria de 4,5% no 1º turno e 4,0% no 2º. |
| PL 3855/2019, 10 Medidas | ENTRAR com ressalva | **PENDENTE** | Rodada clara é 450x1; rodadas de conteúdo não têm descrição utilizável. |
| PEC 182/2007, reforma política | ENTRAR com ressalva | **PENDENTE** | Nenhuma rodada decide a matéria inteira. |
| PL 5587/2016, transporte por aplicativo | ENTRAR | **PENDENTE** | Todas as rodadas decidem artigos isolados. |
| PEC 171/1993, maioridade penal | rodada `14493-442`, 30/06 | rodada **`14493-503`, 01/07** | A de 30/06 rejeitou; a de 01/07 aprovou. O rótulo anuncia a aprovação. |
| PEC 5/2023, imunidade tributária | rodada `2351506-104`, 1º turno | rodada **`2351506-122`, 2º turno** | Régua de PEC: o 2º turno conclui a aprovação. |
| As outras 10 | mantidas | mantidas | Rodada reconferida contra as descrições integrais e confirmada. |

Resumo: **18 antes** viram **13 PRONTAS, 3 PENDENTES e 2 RETIRADAS**, com 2 trocas
de rodada entre as prontas.

## 5. Dois achados de rótulo que mudam o texto da ficha

Não são sobre qual rodada, e sim sobre o que a ficha vai escrever ao lado do
voto. Se o rótulo não disser isso, o sentido do voto fica invertido:

1. **Temer (`2143164-138`)**: votar SIM foi votar por **barrar** o processo
   criminal, porque o que se aprovou foi o parecer pelo indeferimento.
2. **SAP 1/2025 (`2494565-52`)**: votar SIM foi votar por **suspender** a ação
   penal em curso.

Em ambas, um rótulo do tipo "denúncia contra Temer" ou "ação penal" sem o verbo
faria o leitor ler o voto ao contrário.

## 6. O que continua valendo da proposta anterior

Sem mudança nas seções que você ainda não aprovou: despublicar as 6 linhas
defeituosas com 100 pares, e adotar matching por `casa/fonte + votacao_id_api`
recusando votação procedimental. As 20 candidatas do balde de leitura humana
seguem intactas e fora desta lista.

Nada aqui autoriza execução. Migration, matching, despublicação e escrita em
banco continuam exigindo autorização nomeando o ato.


## Alteração pós-aprovação: a denúncia contra Temer saiu, de 13 para 12

Achado do dry-run de 10/08/2026, por medição e não por juízo editorial.

O endpoint `https://dadosabertos.camara.leg.br/api/v2/votacoes/2143164-138/votos`
devolve `{"dados": []}`. A votação existe, o placar de 263 a 227 está na
descrição oficial, e a Câmara **não publicou a lista de votos individuais** desse
id. Conferido também nas outras votações da proposição 2143164: as de Plenário do
mesmo dia são um requerimento aprovado e um rejeitado, ambos procedimentais.

Consequência: a matéria não atribui voto a candidato nenhum e entraria como linha
morta na `votacoes_chave`. Ela sai do dataset e volta para PENDENTE, com o
bloqueio nomeado: **a fonte não expõe o voto nominal desta votação**.

A regra de rótulo dela continua registrada, na migration e em
`tests/votacoes-chave-dataset-v2.test.ts`: se o id voltar, a descrição tem de
dizer que SIM barra a abertura do processo criminal, porque o que se aprovou foi
o parecer pelo indeferimento.

**Placar final do dataset: 12 matérias PRONTAS, 4 PENDENTES, 2 RETIRADAS.**
