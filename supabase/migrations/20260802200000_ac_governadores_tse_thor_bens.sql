-- Correção local pendente: bens declarados por Thor Dantas no TSE 2022.
--
-- FONTE: UM ÚNICO arquivo, bem_candidato_2022_AC.csv, SQ_CANDIDATO 10001649411,
-- que traz 11 linhas somando 253396.75. Isso é deliberado e segue a regra de
-- prevenção escrita em 20260725143000_patrimonio_bem_candidato_duplicado.sql:
-- migration que materializa bem_candidato usa o arquivo da UF sozinho (que já
-- tem a lista completa) ou roda dedupeTsePatrimonioRows antes de somar. O
-- arquivo _BRASIL contém as MESMAS 11 linhas (Padrão A daquela auditoria), então
-- citá-lo junto sugeriria uma soma de união que não aconteceu.
--
-- A migration anterior materializou apenas o valor agregado e deixou bens como
-- [] por engano. O agregado já em produção (253396.75) foi verificado contra o
-- arquivo da UF em 2026-07-25 e está entre as 11 linhas explicitamente NÃO
-- tocadas por aquela correção; a soma dos 11 itens abaixo reproduz esse valor,
-- que é a checagem cruzada de que a itemização não duplicou nem perdeu item.
--
-- Guardas: o UPDATE só atinge a linha se o agregado ainda for o verificado E se
-- bens ainda estiver vazio, então rodar duas vezes não reescreve nem duplica o
-- sufixo de fonte. `fonte` é PRESERVADA e recebe sufixo, para não apagar a
-- evidência do que foi publicado (mesma convenção de 2026-07-25).

-- @write tabela=patrimonio slug=thor-dantas ano=2022 campos=bens,fonte
UPDATE public.patrimonio p
SET
  bens = '[
    {"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"TOYTOTA ETIOS HB CROSS ANO 2017/2018","valor":60000.00},
    {"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL DA EMPRESA LAGE E DANTAS, SOCIEDADE SIMPLES 50% DO CAPITAL","valor":1000.00},
    {"tipo":"Quotas ou quinhões de capital","descricao":"QUOTA DE CAPITAL DA EMPRESA LAGE E DANTAS EDUCAÇÃO MÉDICA 50% DO CAPITAL","valor":1000.00},
    {"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":0.06},
    {"tipo":"Caderneta de poupança","descricao":"POUPANÇA","valor":324.16},
    {"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"AÇÕES TECNOLOGIA BDR","valor":1000.00},
    {"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"AÇÕES SMALL CAPS","valor":1000.00},
    {"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"RF LP HIGH","valor":99596.71},
    {"tipo":"Aplicação de renda fixa (CDB, RDB e outros)","descricao":"BB AMERICANAS PERSONAL MONKEY MARKET","valor":22524.90},
    {"tipo":"Depósito bancário em conta corrente no País","descricao":"CONTA BANCO DO BRASIL","valor":16950.92},
    {"tipo":"Crédito decorrente de empréstimo","descricao":"EMPRESTIMO CONCEDIDO","valor":50000.00}
  ]'::jsonb,
  fonte = fonte || ' [itemizado 2026-08-03: 11 bens de bem_candidato_2022_AC.csv, SQ 10001649411, somando 253396.75, igual ao agregado já verificado]'
FROM public.candidatos c
WHERE p.candidato_id = c.id
  AND c.slug = 'thor-dantas'
  AND p.ano_eleicao = 2022
  AND p.valor_total = 253396.75
  AND (p.bens IS NULL OR p.bens = '[]'::jsonb);
