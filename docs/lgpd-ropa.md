# Registro de Operacoes de Tratamento (ROPA)

Documento exigido pela LGPD (Art. 37). Mapeia todas as operacoes de tratamento de dados pessoais do PuxaFicha.

**Controlador**: PuxaFicha (projeto pessoal de Thiago Salvador)
**Encarregado (DPO)**: A designar (ver secao Pendencias)
**Data de elaboracao**: 2026-04-03
**Ultima atualizacao**: 2026-04-03

---

## 1. Candidatos (tabela `candidatos`)

| Campo | Dado pessoal? | Categoria | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- | --- |
| nome_completo, nome_urna | Sim | Identificacao | Interesse publico (Art. 7, III) + Dados tornados publicos pelo titular (Art. 7, IV) | Identificacao do candidato para consulta publica | Enquanto candidatura ativa ou relevante historicamente | Publico (exibido no site) |
| cpf | Sim (sensivel operacional) | Identificacao fiscal | Interesse publico (Art. 7, III) - dado publico por lei eleitoral (Lei 9.504/97) | Cruzamento de dados entre fontes (TSE, Transparencia) | Permanente. Dado publico de candidatos por lei eleitoral, sem necessidade de descarte pos-eleicao. Nunca exposto publicamente | Apenas server-side (pipeline). Bloqueado via RLS para anon/authenticated |
| cpf_hash | Sim (pseudonimizado) | Identificacao indireta | Mesmo do CPF | Cruzamento sem expor CPF em texto claro | Mesmo do CPF | Bloqueado via RLS |
| email_campanha | Sim | Contato | Dados tornados publicos pelo titular (Art. 7, IV) - declarado ao TSE | Exibicao de contato de campanha | Enquanto candidatura ativa | Bloqueado via RLS. Avaliar se deve ser exibido |
| data_nascimento, idade | Sim | Demografico | Interesse publico (Art. 7, III) | Contextualizacao do perfil | Enquanto candidatura relevante | Publico (exibido no site) |
| naturalidade, formacao, profissao_declarada | Sim | Biografico | Interesse publico (Art. 7, III) | Contextualizacao do perfil | Enquanto candidatura relevante | Publico (exibido no site) |
| genero, estado_civil, cor_raca | Sim | Demografico sensivel (Art. 11) | Interesse publico para politicas e estudos (Art. 11, II, b) - dados declarados ao TSE | Contextualizacao demografica | Enquanto candidatura relevante | Publico (exibido no site) |
| foto_url | Sim | Imagem | Dados tornados publicos (Art. 7, IV) | Identificacao visual | Enquanto candidatura relevante | Publico (exibido no site) |
| redes_sociais | Parcial | Contato publico | Dados tornados publicos pelo titular (Art. 7, IV) | Links para perfis publicos | Enquanto candidatura relevante | Publico (exibido no site) |
| biografia | Parcial | Biografico | Interesse publico (Art. 7, III) + fontes publicas (Wikipedia) | Contextualizacao do candidato | Enquanto candidatura relevante | Publico (exibido no site) |
| wikidata_id | Nao diretamente | Identificador tecnico | N/A (nao e dado pessoal per se) | Vinculo com Wikidata para enriquecimento | Retido internamente | Bloqueado via RLS |

## 2. Historico politico (`historico_politico`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| cargo, periodo, partido, estado | Sim (vinculado a candidato_id) | Interesse publico (Art. 7, III) | Trajetoria politica do candidato | Permanente (registro historico) | Publico |

## 3. Mudancas de partido (`mudancas_partido`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| partido_anterior, partido_novo, data | Sim (vinculado) | Interesse publico (Art. 7, III) | Transparencia sobre fidelidade partidaria | Permanente | Publico |

## 4. Patrimonio (`patrimonio`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| valor_total, bens (JSONB) | Sim | Interesse publico (Art. 7, III) - declaracao obrigatoria ao TSE | Transparencia patrimonial | Permanente (registro historico por ano eleitoral) | Publico (valores agregados e detalhamento) |

## 5. Financiamento (`financiamento`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| totais de arrecadacao | Sim (vinculado) | Interesse publico (Art. 7, III) - dados publicos do TSE | Transparencia de financiamento | Permanente | Publico |
| maiores_doadores (JSONB) | Sim (nomes de terceiros) | Interesse publico (Art. 7, III) - dado publico do TSE | Transparencia de quem financia | Permanente | Publico. **Atencao**: contem dados de terceiros (doadores). Base legal: dado ja tornado publico pelo TSE |

## 6. Votacoes e votos (`votacoes_chave`, `votos_candidato`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| voto do candidato, contradicao | Sim (vinculado) | Interesse publico (Art. 7, III) - voto parlamentar e publico | Transparencia sobre posicionamento | Permanente | Publico |

## 7. Projetos de lei (`projetos_lei`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| autoria, ementa, situacao | Sim (vinculado) | Interesse publico (Art. 7, III) | Atividade legislativa | Permanente | Publico |

## 8. Processos judiciais (`processos`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| tipo, tribunal, descricao, status | Sim (vinculado) | Interesse publico (Art. 7, III) - processos publicos | Transparencia judicial | Permanente | Publico |

## 9. Pontos de atencao (`pontos_atencao`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| categoria, titulo, descricao | Sim (vinculado) | Interesse publico (Art. 7, III) | Alertas editoriais sobre conduta | Enquanto relevante. Revisao periodica | Publico (apenas `visivel = true`, candidatos com `publicavel = true` e, para itens de IA, somente quando `verificado = true`) |
| gerado_por | Metadado | N/A | Transparencia sobre origem (IA vs curadoria) | Mesmo do ponto | Parcialmente publico (badge na ficha individual) |

## 10. Gastos parlamentares (`gastos_parlamentares`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| total_gasto, detalhamento | Sim (vinculado) | Interesse publico (Art. 7, III) - CEAP e publico | Transparencia de uso de recurso publico | Permanente | Publico |

## 11. Sancoes administrativas (`sancoes_administrativas`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| tipo, descricao, orgao | Sim (vinculado) | Interesse publico (Art. 7, III) - Portal da Transparencia | Transparencia sobre sancoes | Permanente | Publico |

## 12. Indicadores estaduais (`indicadores_estaduais`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| estado, indicador, valor | Nao | N/A (dados agregados, sem vinculo a pessoa) | Contextualizacao regional | Permanente | Publico |

## 13. Noticias (`noticias_candidato`)

| Campo | Dado pessoal? | Base legal | Finalidade | Retencao | Compartilhamento |
| --- | --- | --- | --- | --- | --- |
| titulo, url, fonte, data | Sim (vinculado) | Interesse publico (Art. 7, III) + dados publicos (noticias) | Contexto mediatico | 12 meses apos publicacao. Reavaliar | Publico (links para fonte original) |

---

## Resumo de bases legais utilizadas

| Base legal LGPD | Artigo | Aplicacao neste projeto |
| --- | --- | --- |
| Interesse publico | Art. 7, III | Base principal. Dados de candidatos e agentes publicos tratados para transparencia e controle social |
| Dados tornados publicos pelo titular | Art. 7, IV | Fotos, redes sociais, email de campanha publicados pelo proprio candidato |
| Dados pessoais sensiveis para politicas publicas | Art. 11, II, b | Genero, cor/raca, estado civil declarados ao TSE |

---

## Compartilhamento com terceiros

| Terceiro | Tipo | Dados compartilhados | Base contratual |
| --- | --- | --- | --- |
| Supabase (PostgreSQL) | Processador (cloud DB) | Todos os dados do schema | Termos de servico Supabase. Supabase e SOC2 Type II |
| Vercel (hosting) | Processador (CDN/hosting) | Dados renderizados em HTML (nao CPF/email) | Termos Vercel. Vercel e SOC2 Type II |
| GitHub (repositorio) | Armazenamento de codigo | Nenhum dado pessoal em repo (secrets via env vars) | Termos GitHub |
| Google News RSS | Fonte publica | Nenhum dado enviado. Apenas leitura de RSS publico | N/A (leitura publica) |
| APIs publicas (TSE, Camara, Senado) | Fonte publica | Nenhum dado enviado. Apenas leitura | N/A (APIs publicas) |

---

## Pendencias identificadas

1. **DPO/Encarregado**: nao designado. Para agente de tratamento de pequeno porte, a ANPD permite dispensa mediante publicacao de justificativa, mas recomenda designacao.
2. **Canal de direitos do titular**: nao implementado. Precisa de email ou formulario para acesso, correcao, exclusao.
3. **Politica de retencao formal**: definida informalmente neste ROPA. Noticias > 12 meses devem ser descartadas. CPF de candidatos e dado publico por lei eleitoral (Lei 9.504/97), nao requer descarte pos-eleicao.
4. **email_campanha**: bloqueado via RLS, mas avaliar se deve ser exposto na ficha publica ou nao.
5. **gerado_por em pontos_atencao**: ja visivel na ficha individual, mas ainda nao coberto de forma uniforme em toda a superficie publica. Gap parcial de transparencia (ISO 42001).
6. **Dados de terceiros em financiamento**: nomes de doadores sao dados pessoais de terceiros. Base legal (dado publico TSE) e solida, mas documentar.
