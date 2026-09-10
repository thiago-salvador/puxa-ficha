# Busca por estado e nome do candidato

Referência: 10/09/2026. Motor utilizado: web.run. Foram pesquisados 31 nomes: 26 candidatos sem percentual individual no lote inicial e cinco vínculos pendentes. A automação existente passou a exigir essa segunda busca às segundas e quintas, às 9h de São Paulo.

## Resultado incorporado à branch

Nove pesquisas adicionais e 109 respostas brutas foram incorporadas: BA Atlas, CE Quaest, DF Atlas, MS IPR, PA Quaest, PB Atlas, RS Atlas, RS Quaest e SE Quaest. Oito divulgações estão na janela de 14 dias; RS Quaest, de 25/08, permanece identificada como histórica.

Doze das 18 fichas antes sem resultado individual ganharam números. O cadastro ativo tem 193 candidatos a governador, dos quais 187 possuem resultado vinculado; os 13 candidatos à Presidência já tinham resultado. Isso não significa que todos participaram da mesma pesquisa ou que todas as rodadas são igualmente recentes.

## Seis fichas ainda sem resultado individual confirmado

| UF | Candidato | Pendência após busca nominal |
| --- | --- | --- |
| BA | Maria Bona | Fonte suplementar informa zero, mas cenário e registro divergem da tabela principal; valor não incorporado. |
| DF | Expedito Mendonça | Resultado IGAPE localizado, com registro e ficha técnica insuficientes para incorporar esta rodada. |
| MA | Dimas Cassimiro | IPPI não permite individualizar o agrupamento; interpretação inicial de 1% por nome foi rejeitada. |
| MA | Reginaldo Lima | Mesma pendência de agrupamento e consistência da IPPI. |
| MA | Saulo Arcangeli | Mesma pendência de agrupamento e consistência da IPPI. |
| PA | Ruth Reis | Não foi encontrada linha individual para ela nas rodadas selecionadas; não recebe o percentual de outro candidato. |

Os percentuais de cenários históricos, candidatos sem vínculo ativo, espontâneas e categorias agrupadas permanecem separados. Nenhum valor foi rateado a partir de “Outros”. Araceli aparece na pesquisa do Pará com o próprio vínculo; seu resultado não foi transferido para Ruth Reis.

## Verificação

- `npm run verify:pesquisas`: exit 0, 67 testes e seis provas de navegador; build, lint, ortografia, TypeScript e scripts passaram.
- Após alinhar os rótulos do Pará ao texto capturado, `npm run test:pesquisas`: 67 testes, zero falhas. Auditoria: 54 pesquisas aprovadas, 27 UFs e 187 perfis de governador vinculados.
- `npm run test:pesquisas:monitoramento`: 11 testes, zero falhas. Os quatro adaptadores e os 18 alvos técnicos permanecem distintos das fontes revisadas.
- Capturas e hashes conferidos pelos testes. Somatórios dos novos cenários variam entre 99,9% e 100,01%, compatíveis com a precisão publicada.
- Logs locais: `/private/tmp/pf-nominal-verify-final.log`, `/private/tmp/pf-nominal-tests-final.log` e `/private/tmp/pf-nominal-monitor-tests.log`.

Os manifestos `nominal-root-manifesto.json` e `nominal-complemento-manifesto.json` identificam as rodadas incorporadas, os registros, os resultados e suas capturas. `busca-nominal.json` preserva as tentativas e os achados que também podem ter sido rejeitados ou permanecer pendentes.

Publicação no site ainda não realizada: a entrega permanece na PR #304 em rascunho, aguardando autorização de merge e deploy. O agendamento foi atualizado e relido; nenhuma execução futura é apresentada como já concluída.

[confidence: alta, source: catálogos atuais, cadastro ativo, capturas e logs de teste] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
