# Pontos de Atencao (IA) - Fila de Revisao Humana

Gerado em: 2026-04-03

Total: **150 pontos** pendentes de verificacao humana.

Estes pontos foram gerados por IA (`gerado_por = "ia"`) e ainda nao foram verificados (`verificado = false`).
Enquanto nao verificados, estao **invisiveis na superficie publica** (gate SQL + app).

## Estatisticas

| Gravidade | Qtd |
| --- | --- |
| critica | 8 |
| alta | 9 |
| media | 6 |
| baixa | 127 |

| Categoria | Qtd |
| --- | --- |
| feito positivo | 68 |
| perfil | 56 |
| escandalo | 8 |
| patrimonio incompativel | 7 |
| contradição | 5 |
| conflito interesse | 2 |
| contradicao | 2 |
| mudanca posicao | 1 |
| processo grave | 1 |

## Como revisar

Para cada ponto, escolher **uma** acao:

| Acao | O que fazer no banco | Resultado |
| --- | --- | --- |
| **Aprovar** | `UPDATE pontos_atencao SET verificado = true WHERE id = '...'` | Visivel no site |
| **Editar + Aprovar** | Corrigir titulo/descricao, depois `verificado = true` | Visivel corrigido |
| **Rejeitar** | `UPDATE pontos_atencao SET visivel = false WHERE id = '...'` | Invisivel em tudo |
| **Pular** | Nada | Continua invisivel no publico |

Prioridade: critica > alta > media > baixa. Feitos positivos e perfis podem ser revisados em lote.

---

## Critica (8)

### 1. Felicio Ramuth (MDB)

| Campo | Valor |
| --- | --- |
| ID | `c95f5dcc-ea90-40e6-b581-c9a31f3faac1` |
| Categoria | patrimonio incompativel |
| Gravidade | critica |
| Titulo | Offshore no Panama e conta em Andorra nao declaradas |
| Descricao | Conta no principado europeu via offshore Visio Corporation (Panama) nao declarada ao TSE. US$ 1,4 mi bloqueados pela Justica de Andorra |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 2. Gilberto Kassab (PSD)

| Campo | Valor |
| --- | --- |
| ID | `bea2cbad-38c4-47a9-aebd-4222b93fd807` |
| Categoria | escandalo |
| Gravidade | critica |
| Titulo | R$ 58 milhoes da J&F |
| Descricao | MPF acusa Kassab e PSD de receber R$ 58 mi em esquema ilegal do grupo J&F, com R$ 21 mi bloqueados |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 3. Guilherme Derrite (PP)

| Campo | Valor |
| --- | --- |
| ID | `6b344c5b-1568-4c37-b76b-b036bc0d7cb7` |
| Categoria | escandalo |
| Gravidade | critica |
| Titulo | Letalidade policial recorde como secretario |
| Descricao | Mortes por PMs subiram de 396 (2022) para 780 (2024). Operacao Escudo matou 28 em 40 dias |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 4. Guilherme Derrite (PP)

| Campo | Valor |
| --- | --- |
| ID | `315b8592-13a8-4b7c-b179-6af32ee1e790` |
| Categoria | escandalo |
| Gravidade | critica |
| Titulo | Grupo de exterminio Eu Sou a Morte |
| Descricao | Denuncias de participacao em grupo de exterminio em Osasco com depoimento formal de integrante |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 5. Marcio Franca (PSB)

| Campo | Valor |
| --- | --- |
| ID | `a7f75deb-6db9-4e2a-b91c-a658692d4ee8` |
| Categoria | escandalo |
| Gravidade | critica |
| Titulo | Desvio de R$ 500 mi em contratos de saude |
| Descricao | Policia Civil sustenta que Franca teria defendido organizacao criminosa que desviou ate R$ 500 mi em contratos com prestadoras de saude quando governador |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 6. Ricardo Nunes (MDB)

| Campo | Valor |
| --- | --- |
| ID | `071b3d7c-da84-4f9d-a6ed-19dc3c0d14b6` |
| Categoria | conflito interesse |
| Gravidade | critica |
| Titulo | Mafia das creches e empresa familiar |
| Descricao | Empresa fundada por Nunes (Nikkey, dedetizacao) recebeu contratos da prefeitura sem licitacao. Socias sao esposa e filha |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 7. Tarcisio de Freitas (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `cdf01a59-4bc8-4247-b107-f13377d9099a` |
| Categoria | escandalo |
| Gravidade | critica |
| Titulo | Escandalo bilionario no fisco paulista (Operacao Icaro) |
| Descricao | MP revelou esquema de corrupcao de R$ 1 bi em propinas dentro da Sefaz-SP com fraudes em creditos tributarios |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 8. Tarcisio de Freitas (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `a5a31164-ef40-42e5-a2f2-4f68fce227bd` |
| Categoria | escandalo |
| Gravidade | critica |
| Titulo | Violencia policial recorde |
| Descricao | Mortes por PMs saltaram de 396 (2022) para 780 (2024). Operacao Escudo deixou dezenas de mortos com denuncias de execucoes sumarias. Governo denunciado a ONU |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

## Alta (9)

### 9. Felicio Ramuth (MDB)

| Campo | Valor |
| --- | --- |
| ID | `01ad9f78-5867-432f-a7b0-8eaad1ba0ae8` |
| Categoria | conflito interesse |
| Gravidade | alta |
| Titulo | Movimentacao suspeita durante cargo publico |
| Descricao | US$ 1,6 mi movimentados em Andorra no periodo em que era Secretario de Transportes de SJC (2009-2011) |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 10. Geraldo Alckmin (PSB)

| Campo | Valor |
| --- | --- |
| ID | `fa267bd4-cf43-4bee-b556-c35d1c38eba1` |
| Categoria | escandalo |
| Gravidade | alta |
| Titulo | Propina da Odebrecht em duas campanhas |
| Descricao | Acusado por 3 delatores de receber R$ 11,3 mi em caixa dois da Odebrecht em 2010 e 2014. Justica bloqueou R$ 11,3 mi em bens |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 11. Geraldo Alckmin (PSB)

| Campo | Valor |
| --- | --- |
| ID | `74efb2cd-2597-489d-a733-55f3cfe8f193` |
| Categoria | mudanca posicao |
| Gravidade | alta |
| Titulo | Alianca com adversario historico |
| Descricao | Co-fundador do PSDB, migrou para o PSB e se aliou a Lula (PT), contra quem disputou a presidencia em 2006 |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 12. Gilberto Kassab (PSD)

| Campo | Valor |
| --- | --- |
| ID | `dcbfc2f7-dc9c-49fd-b9f6-c80fac8dd082` |
| Categoria | patrimonio incompativel |
| Gravidade | alta |
| Titulo | Aumento patrimonial de 316% em 4 anos |
| Descricao | Entre 1994 e 1998, quando era deputado estadual, patrimonio cresceu mais de 300% |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 13. Guilherme Boulos (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `31c404a8-daef-4cad-b431-393a9cc27ff5` |
| Categoria | processo grave |
| Gravidade | alta |
| Titulo | Processos por invasao de propriedade (MTST) |
| Descricao | Como coordenador do MTST, participou de diversas ocupacoes de imoveis, resultando em processos por esbulho possessorio e dano. Boulos defende as acoes como luta por moradia. |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 14. Guilherme Derrite (PP)

| Campo | Valor |
| --- | --- |
| ID | `264c8585-9ba0-4cc9-81c1-83551cdcd04d` |
| Categoria | patrimonio incompativel |
| Gravidade | alta |
| Titulo | Casa de luxo de R$ 3 mi com patrimonio de R$ 812 mil |
| Descricao | Construiu casa de 440 m2 avaliada em R$ 3 mi, tres vezes seu patrimonio declarado |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 15. Ricardo Nunes (MDB)

| Campo | Valor |
| --- | --- |
| ID | `6d8df0d8-2784-475f-a7cf-00d099bbddb3` |
| Categoria | escandalo |
| Gravidade | alta |
| Titulo | Denuncia de violencia domestica |
| Descricao | Esposa registrou BO em 2011 em Delegacia da Mulher por ameacas e agressoes. Policia Civil confirma legitimidade. Nunes chamou BO de forjado |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 16. Ricardo Nunes (MDB)

| Campo | Valor |
| --- | --- |
| ID | `a63b8955-4319-4971-b373-ac2d0c82c8e4` |
| Categoria | patrimonio incompativel |
| Gravidade | alta |
| Titulo | 9 fazendas em MG com atestado de pobreza |
| Descricao | Declarou 9 propriedades rurais ao TSE somando 1.347 hectares, uma obtida com atestado de pobreza rural |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 17. Tarcisio de Freitas (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `720fc213-f18e-4960-bd22-36bed6a6d2bb` |
| Categoria | contradicao |
| Gravidade | alta |
| Titulo | Declaracao sobre mortes pela PM |
| Descricao | Quando cobrado sobre abusos da PM em marco/2024, respondeu: podem ir pra ONU, pra Liga da Justica, pro diabo, to nem ai |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

## Media (6)

### 18. Erika Hilton (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `729dab5a-0c1f-462f-a74b-4b6d76fbe22e` |
| Categoria | contradicao |
| Gravidade | media |
| Titulo | Acao judicial contra criticos usando estrutura publica |
| Descricao | Acao de R$ 10 mi contra apresentador Ratinho por transfobia gerou representacao no Conselho de Etica |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 19. Erika Hilton (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `ba54d865-e7c2-4675-bc77-df4050016e0a` |
| Categoria | patrimonio incompativel |
| Gravidade | media |
| Titulo | Bolsa de grife supera patrimonio declarado |
| Descricao | Vista com bolsa de grife cujo valor excede o total de R$ 19.990 declarados ao TSE em 2022 |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 20. Fernando Haddad (PT)

| Campo | Valor |
| --- | --- |
| ID | `842e9895-3f67-4c7f-9c84-2718dfaba876` |
| Categoria | patrimonio incompativel |
| Gravidade | media |
| Titulo | Imovel subdeclarado ao TSE |
| Descricao | Declarou apartamento em SP por R$ 90 mil ao TSE, porem pagou R$ 120 mil em 1998 pelo imovel com valor venal de quase R$ 1 milhao |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 21. Haddad (PT)

| Campo | Valor |
| --- | --- |
| ID | `542e3db8-2235-4873-a7eb-c39ba85fa1bf` |
| Categoria | contradição |
| Gravidade | media |
| Titulo | Ministro da Fazenda com deficit fiscal crescente |
| Descricao | Como ministro de Lula, prometeu equilibrio fiscal mas entregou deficit primario de R$ 230 bilhoes em 2023 e R$ 28,4 bilhoes em 2024. Meta fiscal ajustada diversas vezes. |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 22. Marcio Franca (PSB)

| Campo | Valor |
| --- | --- |
| ID | `86f38229-2c24-4894-ba33-cbf6b4bcf45d` |
| Categoria | patrimonio incompativel |
| Gravidade | media |
| Titulo | Patrimonio muito baixo para a carreira |
| Descricao | Declaracao de R$ 273 mil em 2020 para ex-prefeito, deputado, secretario e governador levanta questionamentos |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 23. Marina Silva (PV)

| Campo | Valor |
| --- | --- |
| ID | `59d8307e-260e-4806-b34a-ff0e825973e5` |
| Categoria | contradição |
| Gravidade | media |
| Titulo | Ministra do Meio Ambiente com desmatamento em alta em 2024 |
| Descricao | Assumiu o MMA com promessa de zerar desmatamento. Conseguiu reducao significativa em 2023, mas enfrentou criticas por liberar exploracoes na foz do Amazonas e atrasos no Fundo Amazonia. |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

## Baixa (127)

### 24. ACM Neto (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `cfaa9988-30e6-4d30-9839-dfa95000b25c` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Antonio Carlos Peixoto de Magalhaes Neto (UNIAO) possui 1 mandato(s) registrado(s): Prefeito (Salvador). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 25. Adailton Furia (PSD)

| Campo | Valor |
| --- | --- |
| ID | `7bdd835a-3c35-4a94-9926-f293e24c0cf2` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Adailton de Souza Furia (PSD) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 26. Adriana Accorsi (PT)

| Campo | Valor |
| --- | --- |
| ID | `89eb2561-8911-4329-9be2-1064b4a8c75b` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Adriana Accorsi de Queiroz (PT) possui 3 mandato(s) registrado(s): Deputado Estadual (GO), Deputado Federal (GO), Secretario Estadual. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 27. Alan Rick (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `367f4442-4146-4be0-b20a-30e89bc27337` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Alan Rick Pereira da Silva (UNIAO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 28. Alexandre Curi (PSD)

| Campo | Valor |
| --- | --- |
| ID | `1f4f9c74-e631-4624-94b5-98e32c9222b0` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Alexandre Curi (PSD) possui 2 mandato(s) registrado(s): Vereador (Curitiba), Deputado Estadual (PR). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 29. Alvaro Dias (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `b8043d05-70df-481e-907d-6f8fca2af2d0` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Alvaro Fernandes Dias (REPUBLICANOS) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 30. Alysson Bezerra (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `4fffd306-ec78-4da2-a73c-36d0849495c1` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Alysson Leandro Barbate Bezerra (UNIAO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 31. Amelio Cayres (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `9f42bbdb-09c8-4a1e-b32d-f5db79a59c5f` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Amelio Antunes Cayres (REPUBLICANOS) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 32. Anderson Ferreira (PL)

| Campo | Valor |
| --- | --- |
| ID | `aa8ef217-c1d2-45d7-a13f-710ff7254d36` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Anderson Ferreira de Alencar (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 33. Andre do Prado (PL)

| Campo | Valor |
| --- | --- |
| ID | `3f0ed7d5-6677-4b33-af71-8228d6abef1f` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 7 mandato(s) registrado(s) |
| Descricao | Andre Luis do Prado (PL) possui 7 mandato(s) registrado(s): Presidente da Alesp (SP) desde 2023, Deputado Estadual de SP (SP) desde 2011, Prefeito de Guararema (SP) 2005-2008, Deputado Estadual (SP), Vice-Prefeito (estado de São Paulo). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 34. Andre Kamai (PT)

| Campo | Valor |
| --- | --- |
| ID | `a5c542b8-065f-4e11-907b-dad2e5665cd4` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Andre Luiz Oliveira Kamai (PT) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 35. Arnaldinho Borgo (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `4e0989cc-2df4-4eb5-a250-2f4d9a1c6357` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Arnaldinho Borgo (PSDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 36. Arthur Henrique (PL)

| Campo | Valor |
| --- | --- |
| ID | `9faa27f0-2e3f-4014-8327-e7caf5db6501` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Arthur Cesar Guedes Henrique (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 37. Ataides Oliveira (NOVO)

| Campo | Valor |
| --- | --- |
| ID | `87f3be72-7e0e-441b-83b7-35b06e4babfe` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Ataides de Oliveira Leite (NOVO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 38. Beto Faro (PT)

| Campo | Valor |
| --- | --- |
| ID | `9315c3e4-a72c-4404-a095-0e70f0981292` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Jose Beto Faro Pereira (PT) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 39. Cadu Xavier (PT)

| Campo | Valor |
| --- | --- |
| ID | `dc8a49f5-f87c-404a-a4cf-132e703e9370` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Carlos Eduardo Xavier (PT) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 40. Capitao Wagner (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `6a14a5bd-17c9-49d2-a17d-af6f87ba1c76` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Wagner Sousa Gomes (UNIAO) possui 2 mandato(s) registrado(s): Vereador (Fortaleza), Deputado Estadual (CE). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 41. Celina Leao (PP)

| Campo | Valor |
| --- | --- |
| ID | `1286c10e-90b1-4a66-9002-691f39cc52f7` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Celina Leao Rocha de Siqueira Campos (PP) possui 2 mandato(s) registrado(s): Governador (Distrito Federal (Brasil)), Vice-Governador (Distrito Federal (Brasil)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 42. Cicero Lucena (MDB)

| Campo | Valor |
| --- | --- |
| ID | `12ab6be5-12c2-4366-b59a-e40d89a56ab2` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Cicero de Lucena Filho (MDB) possui 4 mandato(s) registrado(s): Prefeito (João Pessoa), Vice-Governador (PB), Governador (PB), Secretario Estadual. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 43. Ciro Gomes (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `4aa56e73-f09b-4c91-bd04-f03bf01d3ba5` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Ciro Ferreira Gomes (PSB) possui 4 mandato(s) registrado(s): Deputado Estadual (CE), Governador (CE), Ministro, Prefeito (Fortaleza). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 44. Clecio Luis (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `94dc3127-214c-4702-88fa-30b9bc1d75ad` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Clecio Luis Vilhena Vieira (SOLIDARIEDADE) possui 4 mandato(s) registrado(s): Secretario Estadual, Vereador (Macapá), Prefeito (Macapá), Governador (AP). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 45. Cleitinho (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `07fc71d4-ad3a-4acd-ac99-222f5d94a2f8` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Cleitinho Azevedo (REPUBLICANOS) possui 1 mandato(s) registrado(s): Senador (MG). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 46. Confucio Moura (MDB)

| Campo | Valor |
| --- | --- |
| ID | `3f10f40b-97ba-4bd1-aea1-f0b62033473f` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Jose Confucio Aires Moura (MDB) possui 4 mandato(s) registrado(s): Governador (RO), Prefeito (Ariquemes), Deputado Federal (RO), Senador (RO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 47. Da Vitoria (PP)

| Campo | Valor |
| --- | --- |
| ID | `223e5e9b-65cc-4e40-a891-cfdf8ec6f1a0` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Josias da Vitoria (PP) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 48. Daniel Vilela (MDB)

| Campo | Valor |
| --- | --- |
| ID | `c1d107df-59e5-4a57-9249-578c18213cac` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Daniel Goulart Vilela (MDB) possui 4 mandato(s) registrado(s): Deputado Estadual (GO), Deputado Federal (GO), Vereador (Goiânia), Vice-Governador (GO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 49. David Almeida (AVANTE)

| Campo | Valor |
| --- | --- |
| ID | `2bed957b-49b9-4ce5-afbd-5f66c2fedbec` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | David Antonio de Abreu Almeida (AVANTE) possui 3 mandato(s) registrado(s): Deputado Estadual (AM), Prefeito (Manaus), Governador (AM). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 50. Decio Lima (PT)

| Campo | Valor |
| --- | --- |
| ID | `3dcf38a7-96c0-4a1d-a43f-c841a662eb21` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Decio Nery de Lima (PDT) possui 3 mandato(s) registrado(s): Deputado Federal (SC), Prefeito (Blumenau), Vereador (Blumenau). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 51. Delegado Eder Mauro (PL)

| Campo | Valor |
| --- | --- |
| ID | `d556b8e5-8a4c-4b82-86a3-5b930d8ca45f` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Eder Braga Mauro (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 52. Douglas Ruas (PL)

| Campo | Valor |
| --- | --- |
| ID | `67287ca2-ed67-402a-b653-b36c8a7b9d9f` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Douglas Ruas (PL) possui 1 mandato(s) registrado(s): Deputado Estadual (RJ). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 53. Dr. Daniel (PSB)

| Campo | Valor |
| --- | --- |
| ID | `cbfe4606-16bc-4d66-a71d-206687f94674` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Daniel Barbosa Santos (PSB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 54. Dr. Fernando Maximo (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `6382cd2d-a9a8-4616-893a-08396f1ea70d` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Fernando Maximo de Oliveira (UNIAO) possui 2 mandato(s) registrado(s): Secretario Estadual, Deputado Federal (RO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 55. Dr. Furlan (MDB)

| Campo | Valor |
| --- | --- |
| ID | `69ed52a2-5177-4248-946d-c04734c2af0f` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Jose Antonio D Almeida Furlan (MDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 56. Edegar Pretto (PT)

| Campo | Valor |
| --- | --- |
| ID | `d58a6910-d6aa-46ac-abfa-827568cd628f` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Edegar Pretto (PT) possui 1 mandato(s) registrado(s): Deputado Estadual (RS). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 57. Edilson Damiao (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `a623e29e-dc57-49b1-b9ab-aef763fefdbd` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Edilson Damiao da Silva (PP) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 58. Eduardo Braga (MDB)

| Campo | Valor |
| --- | --- |
| ID | `fea18e9b-5064-4e24-b055-9b9e827ad90c` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 6 mandato(s) registrado(s) |
| Descricao | Eduardo Braga Granata (MDB) possui 6 mandato(s) registrado(s): Vereador (Manaus), Vice-Prefeito (Manaus), Prefeito (Manaus), Deputado Estadual (AM), Governador (AM). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 59. Eduardo Braide (PSD)

| Campo | Valor |
| --- | --- |
| ID | `feb712e3-bc11-45c4-b1e1-ac637e1594d6` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Eduardo Costa Braide (PSD) possui 2 mandato(s) registrado(s): Deputado Estadual (MA), Prefeito (São Luís (Maranhão)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 60. Eduardo Girao (NOVO)

| Campo | Valor |
| --- | --- |
| ID | `873ea3ae-c003-45b7-bb74-6c8e624864f9` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Eduardo Girao Monteiro Filho (NOVO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 61. Eduardo Paes (PSD)

| Campo | Valor |
| --- | --- |
| ID | `d302ab8f-010d-4070-b777-4fa901afbeda` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Eduardo da Costa Paes (PSD) possui 3 mandato(s) registrado(s): Prefeito (cidade do Rio de Janeiro), Secretario Estadual, Vereador (cidade do Rio de Janeiro). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 62. Eduardo Riedel (PP)

| Campo | Valor |
| --- | --- |
| ID | `deb688ca-08e9-498f-bad7-8588060d008e` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Eduardo Correa Riedel (PP) possui 1 mandato(s) registrado(s): Governador (MS). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 63. Efraim Filho (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `499dbadc-be03-43db-8352-43d7abd45be0` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Efraim de Araujo Morais Filho (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 64. Elmano de Freitas (PT)

| Campo | Valor |
| --- | --- |
| ID | `cc44fb61-bc64-45e6-8d44-a4dc6d2cd8a7` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Elmano de Freitas da Costa (PT) possui 2 mandato(s) registrado(s): Deputado Estadual (CE), Governador (CE). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 65. Enilton Rodrigues (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `c42f394c-49ea-4e93-b21d-dbf0186512f1` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Enilton Rodrigues (PSOL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 66. Evandro Augusto (MISSAO)

| Campo | Valor |
| --- | --- |
| ID | `a7ea5cc8-92aa-4cbb-b46d-0f68cebfc2b5` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Evandro Augusto (MISSAO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 67. Expedito Netto (PT)

| Campo | Valor |
| --- | --- |
| ID | `7913a909-e03f-4a7e-a34f-c8e0c17329aa` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Expedito Goncalves Ferreira Netto (PT) possui 1 mandato(s) registrado(s): Deputado Federal (RO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 68. Fabio Mitidieri (PSD)

| Campo | Valor |
| --- | --- |
| ID | `8e5cf809-6dfe-449f-abce-a95337c69db2` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Fabio Mitidieri de Amorim (PSD) possui 2 mandato(s) registrado(s): Deputado Federal (SE), Governador (SE). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 69. Fabio Trad (PT)

| Campo | Valor |
| --- | --- |
| ID | `40f52fd9-5ae4-4df4-9e45-bf751b259731` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Fabio Trad (PT) possui 1 mandato(s) registrado(s): Deputado Federal (MS). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 70. Felipe Camarao (PT)

| Campo | Valor |
| --- | --- |
| ID | `280c85fc-a3a8-4f8e-b081-d3d5b7d3cc5c` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Felipe Costa Camarao (PT) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 71. Gabriel Azevedo (MDB)

| Campo | Valor |
| --- | --- |
| ID | `736ecdc1-f783-4e0e-a5d8-3ba00863ae60` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Gabriel Azevedo (MDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 72. Gabriel Souza (MDB)

| Campo | Valor |
| --- | --- |
| ID | `22967495-f8db-4ddb-8efa-3cbac74c895c` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Governador(a) em exercicio de RS |
| Descricao | Gabriel Souza (MDB) atualmente exerce o cargo de governador(a) de RS. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 73. Gabriel Souza (MDB)

| Campo | Valor |
| --- | --- |
| ID | `26d84fd1-442a-4a19-8dbd-f6ba37df0102` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Gabriel Souza (MDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 74. Garotinho (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `36ef65c8-d5ce-4ef1-afc4-dd4c654dd6a0` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Anthony William Matheus de Oliveira (REPUBLICANOS) possui 4 mandato(s) registrado(s): Deputado Estadual (RJ), Governador (estado do Rio de Janeiro), Secretario Estadual, Prefeito (Campos dos Goytacazes). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 75. Gilson Machado (PL)

| Campo | Valor |
| --- | --- |
| ID | `063f63f8-0fbe-4028-8e39-94834148ac6d` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Gilson Machado Guimaraes Neto (PL) possui 1 mandato(s) registrado(s): Ministro. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 76. Guilherme Boulos (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `5a5c2b77-ac95-47c4-b6c3-a497d27ea2d6` |
| Categoria | contradição |
| Gravidade | baixa |
| Titulo | Discurso contra privilegios mas aceita fundo eleitoral |
| Descricao | Critico vocal do financiamento publico de campanhas e do fundo eleitoral. Em 2022 e 2024, utilizou recursos do fundao para suas campanhas, justificando como necessidade do sistema atual. |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 77. Guto Silva (PSD)

| Campo | Valor |
| --- | --- |
| ID | `76bdffb8-80ad-4c8e-b6c8-f86e69df46f5` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Luiz Augusto Silva (PSD) possui 3 mandato(s) registrado(s): Vereador (Pato Branco), Deputado Estadual (PR), Secretario Estadual. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 78. Hana Ghassan (MDB)

| Campo | Valor |
| --- | --- |
| ID | `59afc792-415e-4e59-9fc0-6f71ea883b0c` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Hana Ghassan Tuma (MDB) possui 2 mandato(s) registrado(s): Vice-Governador (PA), Secretario Estadual. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 79. Helder Salomao (PT)

| Campo | Valor |
| --- | --- |
| ID | `436ebb81-a612-4706-9e42-09015ba5de3a` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Helder Ignacio Salomao (PT) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 80. Hertz Dias (PSTU)

| Campo | Valor |
| --- | --- |
| ID | `faea612f-c093-402c-ab13-53a78f38f098` |
| Categoria | contradição |
| Gravidade | baixa |
| Titulo | Candidato pouco conhecido, sem mandato previo |
| Descricao | Sem historico de mandato eletivo ou cargo publico relevante. Candidatura pelo PSTU sem base eleitoral propria expressiva. |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 81. Hildon Chaves (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `86a548b7-085b-4ba9-a195-7cf4876de197` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Hildon de Lima Chaves (PSDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 82. Ivan Moraes (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `728df245-2b23-4600-af41-bb20abc26a54` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Ivan Moraes Filho (PSOL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 83. Janaina Riva (MDB)

| Campo | Valor |
| --- | --- |
| ID | `ddf1d924-7480-41ba-b212-7ebfef785cd0` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Janaina Riva (MDB) possui 1 mandato(s) registrado(s): Deputado Estadual (MT). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 84. Jeronimo (PT)

| Campo | Valor |
| --- | --- |
| ID | `ec378763-10a3-4d4d-b5d2-5c188d2164a9` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Jeronimo Rodrigues de Jesus (PT) possui 2 mandato(s) registrado(s): Governador (BA), Secretario Estadual. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 85. JHC (PL)

| Campo | Valor |
| --- | --- |
| ID | `9fa4db8b-2b96-4595-b982-37042586e0dc` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Joao Henrique Caldas (PL) possui 3 mandato(s) registrado(s): Deputado Estadual (AL), Prefeito (Maceió), Deputado Federal (AL). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 86. Joao Campos (PSB)

| Campo | Valor |
| --- | --- |
| ID | `1f2b7b85-dae2-4fa8-890e-f2c105d0916e` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Joao Henrique de Andrade Lima Campos (PSB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 87. Joao Capiberibe (PSB)

| Campo | Valor |
| --- | --- |
| ID | `7dee9d0a-c248-412f-b276-686ca4410747` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Joao Alberto Rodrigues Capiberibe (PSB) possui 2 mandato(s) registrado(s): Governador (AP), Prefeito (Macapá). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 88. Joao Henrique Catan (NOVO)

| Campo | Valor |
| --- | --- |
| ID | `4f10f3ad-7f12-4877-ac2d-4e6a29bbbb86` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Joao Henrique Catan (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 89. Joao Rodrigues (PSD)

| Campo | Valor |
| --- | --- |
| ID | `ec9f865a-e1d2-43c9-824a-5e2f2fae8327` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Joao Rodrigues (AVANTE) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 90. Joao Roma (PL)

| Campo | Valor |
| --- | --- |
| ID | `d472211d-710d-4807-9c0f-772b0f15e7a2` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Joao Carlos Bacelar Batista (PL) possui 1 mandato(s) registrado(s): Ministro. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 91. Joel Rodrigues (PP)

| Campo | Valor |
| --- | --- |
| ID | `3ebc4da9-95b7-4518-9dc4-96bc2ae2baa1` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Joel Rodrigues de Castro (PP) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 92. Jorginho Mello (PL)

| Campo | Valor |
| --- | --- |
| ID | `e17084e8-08cd-4cc4-88a9-84dc4bd237b5` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Governador(a) em exercicio de SC |
| Descricao | Jorge Jose de Mello (PP) atualmente exerce o cargo de governador(a) de SC. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 93. Jorginho Mello (PL)

| Campo | Valor |
| --- | --- |
| ID | `2e174de9-b67e-4b52-87af-4eec5637ac4b` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 5 mandato(s) registrado(s) |
| Descricao | Jorge Jose de Mello (PP) possui 5 mandato(s) registrado(s): Senador (DF) 2019-2027, Deputado Federal (SC), Deputado Estadual (SC), Governador (SC), Senador (SC). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 94. Jose Carlos Aleluia (NOVO)

| Campo | Valor |
| --- | --- |
| ID | `06d6d52d-902d-4ed4-aa2c-0f3a6d6b80a2` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Jose Carlos Aleluia Costa (NOVO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 95. Jose Eliton (PSB)

| Campo | Valor |
| --- | --- |
| ID | `0a34adaa-8f1f-4832-95b0-1440d96b9233` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Jose Eliton de Figueredo Telles Junior (PSB) possui 2 mandato(s) registrado(s): Governador (GO), Vice-Governador (GO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 96. Juliana Brizola (PDT)

| Campo | Valor |
| --- | --- |
| ID | `8885902e-c940-44ef-ba04-515e24aaa9fe` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Juliana Daudt Brizola (PDT) possui 2 mandato(s) registrado(s): Vereador (Porto Alegre), Deputado Estadual (RS). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 97. Lahesio Bonfim (NOVO)

| Campo | Valor |
| --- | --- |
| ID | `4e3563d8-f29f-4324-adc4-c4f3d9eace9b` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Lahesio Rodrigues Bonfim (NOVO) possui 1 mandato(s) registrado(s): Prefeito (municípios do Maranhão). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 98. Laurez Moreira (PSD)

| Campo | Valor |
| --- | --- |
| ID | `a9530d43-5506-49cd-b316-ae174335aefe` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Laurez da Rocha Moreira (PSD) possui 3 mandato(s) registrado(s): Deputado Estadual (TO), Prefeito (Gurupi), Vereador (TO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 99. Leandro Grass (PT)

| Campo | Valor |
| --- | --- |
| ID | `a00d919e-268b-46c4-a277-1c49cd931a0a` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Leandro Grass Peixoto (PT) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 100. Lucas Ribeiro (PP)

| Campo | Valor |
| --- | --- |
| ID | `3569e398-4ea7-4452-b78f-ea28c00d3de4` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Lucas Ribeiro (PP) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 101. Luciano Zucco (PL)

| Campo | Valor |
| --- | --- |
| ID | `f2de039e-621c-4e0d-b158-c51ceb7e3b75` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Luciano Lorenzini Zucco (MDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 102. Lucien Rezende (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `e60dd46b-f933-435a-a6d6-6f21b25e9d7d` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Lucien Miranda de Rezende (PSOL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 103. Mailza Assis (PP)

| Campo | Valor |
| --- | --- |
| ID | `6e668ed7-c226-4111-bdf9-60d4348e9d4e` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Mailza Gomes Assis (PP) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 104. Marcelo Brigadeiro (MISSAO)

| Campo | Valor |
| --- | --- |
| ID | `c75c15d0-9ed6-4504-babd-9c6d5453575e` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Marcelo Brigadeiro (MISSAO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 105. Marcelo Maranata (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `7680c5aa-5e11-4fc3-9a61-22b11763d96d` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Marcelo Maranata (PSDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 106. Marconi Perillo (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `3715ece3-3124-4940-acf5-6e2d30666d9b` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Marconi Ferreira Perillo Junior (PSDB) possui 4 mandato(s) registrado(s): Deputado Estadual (GO), Deputado Federal (GO), Governador (GO), Senador (GO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 107. Marcos Rogerio (PL)

| Campo | Valor |
| --- | --- |
| ID | `094ea4c9-aa96-4f3a-9fa6-51e21ef24761` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Marcos Rogerio da Silva Brito (PL) possui 3 mandato(s) registrado(s): Senador (RO), Vereador (RO), Deputado Federal (RO). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 108. Marcos Vieira (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `81f24d98-84c8-4ea8-921d-1be4f1976212` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Marcos Vieira (PSDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 109. Margarete Coelho (PP)

| Campo | Valor |
| --- | --- |
| ID | `1e6ee577-bfef-4bfb-aead-a1520b6b5c2b` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Margarete de Castro Coelho (PP) possui 2 mandato(s) registrado(s): Vice-Governador (PI), Deputado Estadual (PI). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 110. Maria da Consolacao (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `f1dfbd44-57f7-49a7-8575-30f50d116c1a` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Maria da Consolacao Soares (PSOL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 111. Maria do Carmo (PP)

| Campo | Valor |
| --- | --- |
| ID | `bfb1c41e-2691-4e0b-82be-a6bebe4d3a71` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Maria do Carmo Seffair (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 112. Mateus Simoes (PSD)

| Campo | Valor |
| --- | --- |
| ID | `05b838ac-558b-4f82-8726-b41766a155c5` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Mateus Simoes (PSD) possui 4 mandato(s) registrado(s): Governador (MG), Secretario Estadual, Vereador (Belo Horizonte), Vice-Governador (MG). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 113. Natasha Slhessarenko (PSD)

| Campo | Valor |
| --- | --- |
| ID | `d52ca41e-99d4-4fce-84c4-b869e4e1bbe8` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Natasha Slhessarenko (PSD) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 114. Nikolas Ferreira (PL)

| Campo | Valor |
| --- | --- |
| ID | `78c804d9-df99-42d2-9978-f980b00b6f9f` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Nikolas Ferreira Oliveira (PL) possui 2 mandato(s) registrado(s): Vereador (Belo Horizonte), Deputado Federal (MG). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 115. Omar Aziz (PSD)

| Campo | Valor |
| --- | --- |
| ID | `15d6bab6-d2f9-4b54-971e-e185f81fb67b` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 5 mandato(s) registrado(s) |
| Descricao | Omar Jose Abdel Aziz (PSD) possui 5 mandato(s) registrado(s): Deputado Estadual (AM), Governador (AM), Vice-Governador (AM), Vice-Prefeito (Manaus), Vereador (Manaus). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 116. Orleans Brandao (MDB)

| Campo | Valor |
| --- | --- |
| ID | `df1ea0bc-afc2-407f-8db0-c031841d438e` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Orleans Torres Ribeiro Brandao (MDB) possui 2 mandato(s) registrado(s): Vice-Governador (MA), Governador (MA). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 117. Otaviano Pivetta (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `01e651ba-8ac2-429f-bcc1-2773cf4a6421` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Otaviano Pivetta (REPUBLICANOS) possui 3 mandato(s) registrado(s): Deputado Estadual (MT), Prefeito (Lucas do Rio Verde), Vice-Governador (MT). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 118. Paula Belmonte (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `575d2379-025a-4f77-803b-3aed7ad1ee1c` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Paula Francinete Belmonte da Silva (PSDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 119. Paulo Hartung (PSD)

| Campo | Valor |
| --- | --- |
| ID | `4dbb88ba-ce2d-4676-92e7-6354076dc3a4` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Paulo Cesar Hartung Gomes (PSD) possui 3 mandato(s) registrado(s): Deputado Estadual (Espírito Santo (estado)), Governador (Espírito Santo (estado)), Prefeito (Vitória (Espírito Santo)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 120. Paulo Martins (NOVO)

| Campo | Valor |
| --- | --- |
| ID | `d459b445-d1e0-44f9-8b8d-1ea52c11dc3b` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Paulo Martins (NOVO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 121. Pazolini (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `9c885daa-3da5-489c-80c2-6dab87585ec1` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Lorenzo Pazolini (REPUBLICANOS) possui 2 mandato(s) registrado(s): Deputado Estadual (Espírito Santo (estado)), Prefeito (Vitória (Espírito Santo)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 122. Pedro Cunha Lima (PSD)

| Campo | Valor |
| --- | --- |
| ID | `e986b7c1-13e2-47bc-a0eb-55ef4246a963` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Pedro Cunha Lima (PSD) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 123. Professora Dorinha (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `47a606c9-eaff-476c-912d-9ede3b371172` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Maria Auxiliadora Seabra Rezende (UNIAO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 124. Rafael Fonteles (PT)

| Campo | Valor |
| --- | --- |
| ID | `93997216-4abb-4afc-8821-ea82fce774c0` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Rafael Tajra Fonteles (PT) possui 2 mandato(s) registrado(s): Secretario Estadual, Governador (PI). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 125. Rafael Greca (MDB)

| Campo | Valor |
| --- | --- |
| ID | `e5d8f985-936d-43b6-81f2-c76b91c07ad5` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 5 mandato(s) registrado(s) |
| Descricao | Rafael Valdomiro Greca de Macedo (PDT) possui 5 mandato(s) registrado(s): Ministro, Prefeito (Curitiba), Secretario Estadual, Deputado Estadual (PR), Vereador (Curitiba). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 126. Raquel Lyra (PSD)

| Campo | Valor |
| --- | --- |
| ID | `8e8db2cc-7163-45ed-af6a-0909812f22ac` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Raquel Teixeira Lyra Lucena (PSD) possui 4 mandato(s) registrado(s): Secretario Estadual, Deputado Estadual (PE), Governador (PE), Prefeito (Caruaru). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 127. Renan Filho (MDB)

| Campo | Valor |
| --- | --- |
| ID | `61a06eae-4815-41fc-acd9-d28d279c41f7` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Renan Calheiros Filho (MDB) possui 3 mandato(s) registrado(s): Deputado Federal (AL), Governador (AL), Prefeito (Murici (Alagoas)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 128. Requiao Filho (PDT)

| Campo | Valor |
| --- | --- |
| ID | `826f8b9e-3b43-4d2f-9c7a-97db2dd481ff` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Mauricio Thadeu de Mello e Silva (PDT) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 129. Ricardo Cappelli (PSB)

| Campo | Valor |
| --- | --- |
| ID | `b1543668-2fae-4e58-a4c6-95c57317d29a` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Ricardo Ribeiro Cappelli (PSB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 130. Ricardo Ferraco (MDB)

| Campo | Valor |
| --- | --- |
| ID | `337bc0e5-614c-433d-8da9-584e3fee29f7` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Ricardo de Rezende Ferraco (MDB) possui 4 mandato(s) registrado(s): Deputado Estadual (Espírito Santo (estado)), Governador (Espírito Santo (estado)), Vereador (Cachoeiro de Itapemirim), Vice-Governador (Espírito Santo (estado)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 131. Roberto Claudio (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `7bb91fc3-a07b-4ac4-a106-2b571754fc96` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Roberto Claudio Rodrigues Bezerra (UNIAO) possui 2 mandato(s) registrado(s): Deputado Estadual (CE), Prefeito (Fortaleza). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 132. Rodrigo Bacellar (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `8caca319-a3d2-4aef-867e-b242009d3c27` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Rodrigo Bacellar (UNIAO) possui 1 mandato(s) registrado(s): Deputado Estadual (RJ). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 133. Rodrigo Pacheco (PSD)

| Campo | Valor |
| --- | --- |
| ID | `4131d869-ec15-4585-904c-08e26f4ed8f9` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Rodrigo Pacheco Amaral (PSD) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 134. Ronaldo Mansur (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `0be8b601-b952-4fca-be41-b92eb39b96a1` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Ronaldo Mansur (PSOL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 135. Samara Martins (UP)

| Campo | Valor |
| --- | --- |
| ID | `9dc0144f-fd71-41d5-9fcf-286577fbf370` |
| Categoria | contradição |
| Gravidade | baixa |
| Titulo | Candidata sem historico politico ou mandato previo |
| Descricao | Sem mandato eletivo anterior ou experiencia em gestao publica. Candidatura pela UP sem base eleitoral consolidada. |
| Visivel | false |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 136. Sergio Moro (PL)

| Campo | Valor |
| --- | --- |
| ID | `29afdb13-b172-480c-ba91-1253ce47605f` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Sergio Fernando Moro (MDB) possui 1 mandato(s) registrado(s): Ministro. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 137. Sergio Vidigal (PDT)

| Campo | Valor |
| --- | --- |
| ID | `e1aa7708-22e5-465b-b3a6-253303b443d2` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Sergio Vidigal (PDT) possui 3 mandato(s) registrado(s): Deputado Estadual (Espírito Santo (estado)), Prefeito (Serra (Espírito Santo)), Vereador (Serra (Espírito Santo)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 138. Silvio Mendes (UNIAO)

| Campo | Valor |
| --- | --- |
| ID | `a3bec2b9-6588-4451-822f-69e1ebaca28b` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Silvio Mendes de Oliveira Filho (UNIAO) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 139. Simao Jatene (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `df20fe00-e14c-4e9c-9d8c-66cff2e8ee20` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Simao Robison Oliveira Jatene (PSDB) possui 1 mandato(s) registrado(s): Governador (PA). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 140. Soldado Sampaio (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `a48921e3-0988-4125-bb39-4ea2729a57a2` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Soldado Sampaio (PL) possui 1 mandato(s) registrado(s): Deputado Estadual (RR). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 141. Tadeu de Souza (PP)

| Campo | Valor |
| --- | --- |
| ID | `ac612964-c420-411c-811d-d55ee2ceb5b0` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Tadeu de Souza Lima (PP) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 142. Tarcisio Motta (PSOL)

| Campo | Valor |
| --- | --- |
| ID | `d1e99ff7-5859-4f0e-8e48-1fb634e70522` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Tarcisio Motta de Carvalho (PSOL) possui 1 mandato(s) registrado(s): Vereador (cidade do Rio de Janeiro). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 143. Teresa Surita (MDB)

| Campo | Valor |
| --- | --- |
| ID | `c059feb7-19e2-4a87-b65e-da9f0519cf97` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Teresa Juca Surita (MDB) possui 2 mandato(s) registrado(s): Deputado Federal (RR), Prefeito (Boa Vista (Roraima)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 144. Thiago de Joaldo (PP)

| Campo | Valor |
| --- | --- |
| ID | `fed9d96e-873d-4024-be96-65b699db2079` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 1 mandato(s) registrado(s) |
| Descricao | Thiago Rezende de Oliveira (PP) possui 1 mandato(s) registrado(s): Deputado Federal (SE). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 145. Tiao Bocalom (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `409c1b11-9efa-49bb-8b6b-4434d1c77cf9` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 4 mandato(s) registrado(s) |
| Descricao | Sebastiao Bocalom Rodrigues (PL) possui 4 mandato(s) registrado(s): Prefeito (Rio Branco (Acre)), Secretario Estadual, Prefeito (Acrelândia), Vereador (PR). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 146. Valmir de Francisquinho (REPUBLICANOS)

| Campo | Valor |
| --- | --- |
| ID | `46456de7-0984-4b7a-ab37-61cb54054f4b` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Valmir dos Santos Costa (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 147. Vicentinho Junior (PSDB)

| Campo | Valor |
| --- | --- |
| ID | `6eea7760-b72d-45c4-ae23-914f542ca7f0` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Vicente Lopes de Oliveira Junior (PSDB) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 148. Washington Reis (MDB)

| Campo | Valor |
| --- | --- |
| ID | `355dd31a-37e1-4cd3-8d68-a4d4b6ae8a56` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 3 mandato(s) registrado(s) |
| Descricao | Washington Reis de Oliveira (MDB) possui 3 mandato(s) registrado(s): Deputado Estadual (RJ), Prefeito (Duque de Caxias (Rio de Janeiro)), Vereador (Duque de Caxias (Rio de Janeiro)). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 149. Wellington Fagundes (PL)

| Campo | Valor |
| --- | --- |
| ID | `eca3c1a8-9afc-479c-958d-34f1cb6b5c64` |
| Categoria | feito positivo |
| Gravidade | baixa |
| Titulo | Carreira politica: 2 mandato(s) registrado(s) |
| Descricao | Wellington Fagundes (PL) possui 2 mandato(s) registrado(s): Deputado Federal (MT), Senador (MT). |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

### 150. Wilder Morais (PL)

| Campo | Valor |
| --- | --- |
| ID | `0060d42d-335d-4da2-afe4-18359d3507e1` |
| Categoria | perfil |
| Gravidade | baixa |
| Titulo | Sem historico de mandato eletivo registrado |
| Descricao | Wilder Gomes de Morais (PL) nao possui mandato eletivo federal ou estadual registrado nas bases do TSE, Camara ou Senado. Pode ter atuacao em nivel municipal ou ser estreante na politica. |
| Visivel | true |

**Acao**: [ ] Aprovar  [ ] Editar  [ ] Rejeitar  [ ] Pular

**Notas do revisor**:

---

## SQL helpers

```sql
-- Aprovar em lote (substituir IDs)
UPDATE pontos_atencao SET verificado = true WHERE id IN ('id1', 'id2');

-- Rejeitar em lote
UPDATE pontos_atencao SET visivel = false WHERE id IN ('id1', 'id2');

-- Aprovar todos os feitos positivos de uma vez (se confiavel)
UPDATE pontos_atencao SET verificado = true WHERE gerado_por = 'ia' AND verificado = false AND categoria = 'feito_positivo';

-- Aprovar todos os perfis de uma vez (se confiavel)
UPDATE pontos_atencao SET verificado = true WHERE gerado_por = 'ia' AND verificado = false AND categoria = 'perfil';
```
