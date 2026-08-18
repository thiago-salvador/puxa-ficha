# P-PATRIMONIO-NACIONAL, Fase A

Snapshot positivo de patrimônio 2026 para as fichas públicas, sem registrar ausência oficial.

## Snapshot e proveniência

- Bens: https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip
- Last-Modified: Sat, 15 Aug 2026 22:35:56 GMT; Content-Length: 3745138; SHA-256: `db5b5a3e430670496aedb27a6dc9cd679117ff519f55222e8c70792faeca59c8`
- Consulta de candidaturas: https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
- Last-Modified: Sat, 15 Aug 2026 22:35:52 GMT; Content-Length: 3042236; SHA-256: `e0ae0300af3b14067dc49fb15510f32244a72093cb2a1249cc9da9cedbd3375c`
- Geração dos CSVs: bens 15/08/2026 19:30:07; candidaturas 15/08/2026 19:30:51
- Snapshot de fichas públicas: 174 linhas, SHA-256 `873168d8c2843996e99de1ac4ff2396931b149e5e116f7f38d98342d7d4e20d3`
- Universo congelado: SHA-256 `f8c0e3dfb96d1466203579dd607c0d197b2a6e523f21310a108e4f4e5d00cb42`; seed versionado: SHA-256 `99463168ad9200f6e0ec35e5a93ed2d74fb249bc3f4bc5499a7e9f3c0d3615ed`

## Resultado medido

- Fichas públicas recontadas: 174
- Identidades fechadas por SQ/CPF, sem nome: 132
- Excluídas por identidade: 42
- Com declaração positiva no ZIP: 117
- Sem declaração neste snapshot, sem gravar ausência: 15
- Já carregadas com identidade segura no PR #203: 9
- Linhas 2026 geradas para upsert: 108
- Bens inseridos ou atualizados: 996
- Soma das linhas geradas: R$ 1.133.302.392,67

## Dez maiores somas na migration

| Candidato | SQ | Bens | Total |
|---|---:|---:|---:|
| otaviano-pivetta | 110002551480 | 22 | R$ 575.680.870,95 |
| maria-do-carmo | 40002541626 | 27 | R$ 118.473.769,48 |
| acm-neto | 50002533190 | 44 | R$ 84.888.809,63 |
| wilder-morais | 90002551791 | 10 | R$ 65.160.903,35 |
| ataides-oliveira | 270002548412 | 6 | R$ 54.458.902,00 |
| hildon-chaves | 220002542916 | 3 | R$ 30.330.625,02 |
| ricardo-ferraco | 80002552172 | 31 | R$ 27.668.789,55 |
| eduardo-riedel | 120002536582 | 17 | R$ 16.147.849,34 |
| wellington-fagundes | 110002551737 | 28 | R$ 13.132.463,00 |
| marconi-perillo | 90002543463 | 24 | R$ 11.876.815,71 |

## Sem declaração neste snapshot

- `dr-luisinho`, SQ 10002533539, Governador/AC
- `gilberto-vasconcelos`, SQ 40002535267, Governador/AM
- `henrique-areas`, SQ 130002552308, Governador/MG
- `hertz-dias`, SQ 280002541457, Presidente
- `izadora-dias`, SQ 250002553062, Governador/SP
- `jeferson-bezerra`, SQ 120002550198, Governador/MS
- `jeremias-cosmo`, SQ 170002541258, Governador/PE
- `juliete-pantoja`, SQ 190002547272, Governador/RJ
- `luan-monteiro`, SQ 190002552513, Governador/RJ
- `policial-edjane`, SQ 250002548080, Governador/SP
- `rafael-duda`, SQ 130002546802, Governador/MG
- `ricardo-marques`, SQ 260002549466, Governador/SE
- `rui-costa-pimenta`, SQ 280002552487, Presidente
- `tulio-lopes`, SQ 130002544122, Governador/MG
- `vera-lucia`, SQ 250002536915, Governador/SP

## Excluídos por identidade

- `alexandre-salomao`, SQ não resolvido, Governador/PR, motivo `no_sq_or_cpf`, rota `nenhuma`
- `alvaro-dias-rn`, SQ não resolvido, Governador/RN, motivo `cpf_mismatch`, rota `seed_sq`
- `andre-luis`, SQ não resolvido, Governador/MA, motivo `no_sq_or_cpf`, rota `nenhuma`
- `ariel-capistrano`, SQ não resolvido, Governador/BA, motivo `no_sq_or_cpf`, rota `nenhuma`
- `arinalda-do-mlb`, SQ não resolvido, Governador/RN, motivo `no_sq_or_cpf`, rota `nenhuma`
- `ben-mendes`, SQ não resolvido, Governador/MG, motivo `no_sq_or_cpf`, rota `nenhuma`
- `breno-barcelar`, SQ não resolvido, Governador/ES, motivo `no_sq_or_cpf`, rota `nenhuma`
- `camila-falcao`, SQ não resolvido, Governador/PE, motivo `no_sq_or_cpf`, rota `nenhuma`
- `carlos-cley`, SQ não resolvido, Governador/AP, motivo `no_sq_or_cpf`, rota `nenhuma`
- `david-almeida`, SQ não resolvido, Governador/AM, motivo `cpf_mismatch`, rota `seed_sq`
- `dr-daniel`, SQ não resolvido, Governador/PA, motivo `cpf_not_found_or_scope_mismatch`, rota `cpf_consulta`
- `dr-helton-monteiro`, SQ não resolvido, Governador/SE, motivo `no_sq_or_cpf`, rota `nenhuma`
- `du-pereira`, SQ não resolvido, Governador/TO, motivo `no_sq_or_cpf`, rota `nenhuma`
- `elisson-ferreira`, SQ não resolvido, Governador/DF, motivo `no_sq_or_cpf`, rota `nenhuma`
- `eudo-raffael`, SQ não resolvido, Governador/AC, motivo `no_sq_or_cpf`, rota `nenhuma`
- `farah-mesquita`, SQ não resolvido, Governador/RR, motivo `no_sq_or_cpf`, rota `nenhuma`
- `francisco-jurity`, SQ não resolvido, Governador/PI, motivo `no_sq_or_cpf`, rota `nenhuma`
- `gisvaldo-oliveira`, SQ não resolvido, Governador/PI, motivo `no_sq_or_cpf`, rota `nenhuma`
- `huggo-leonardo`, SQ não resolvido, Governador/CE, motivo `no_sq_or_cpf`, rota `nenhuma`
- `joao-campos`, SQ não resolvido, Governador/PE, motivo `cpf_mismatch`, rota `seed_sq`
- `joao-rodrigues`, SQ não resolvido, Governador/SC, motivo `cpf_not_found_or_scope_mismatch`, rota `cpf_consulta`
- `kiko-caputo`, SQ não resolvido, Governador/DF, motivo `no_sq_or_cpf`, rota `nenhuma`
- `lais-chaud`, SQ não resolvido, Governador/SC, motivo `no_sq_or_cpf`, rota `nenhuma`
- `laudicerio-aguiar`, SQ não resolvido, Governador/MT, motivo `cpf_not_found_or_scope_mismatch`, rota `cpf_consulta`
- `leonardo-avalanche`, SQ não resolvido, Presidente, motivo `no_sq_or_cpf`, rota `nenhuma`
- `luiz-franca`, SQ não resolvido, Governador/PR, motivo `no_sq_or_cpf`, rota `nenhuma`
- `mauricio-coelho`, SQ não resolvido, Governador/MT, motivo `cpf_not_found_or_scope_mismatch`, rota `cpf_consulta`
- `natasha-slhessarenko`, SQ não resolvido, Governador/MT, motivo `no_sq_or_cpf`, rota `nenhuma`
- `orleans-brandao`, SQ não resolvido, Governador/MA, motivo `no_sq_or_cpf`, rota `nenhuma`
- `pedro-abib`, SQ não resolvido, Governador/RO, motivo `no_sq_or_cpf`, rota `nenhuma`
- `rafaell-milas`, SQ não resolvido, Governador/MT, motivo `no_sq_or_cpf`, rota `nenhuma`
- `reginaldo-lima`, SQ não resolvido, Governador/MA, motivo `no_sq_or_cpf`, rota `nenhuma`
- `renan-filho`, SQ não resolvido, Governador/AL, motivo `cpf_not_found_or_scope_mismatch`, rota `cpf_consulta`
- `renan-hallais`, SQ não resolvido, Governador/PE, motivo `no_sq_or_cpf`, rota `nenhuma`
- `renato-gomes`, SQ não resolvido, Governador/MS, motivo `no_sq_or_cpf`, rota `nenhuma`
- `ricardo-cappelli`, SQ não resolvido, Governador/DF, motivo `no_sq_or_cpf`, rota `nenhuma`
- `rodrigo-bolsonaro`, SQ não resolvido, Governador/RN, motivo `no_sq_or_cpf`, rota `nenhuma`
- `samuel-de-mattos`, SQ não resolvido, Governador/PR, motivo `no_sq_or_cpf`, rota `nenhuma`
- `santiago-belizario`, SQ não resolvido, Governador/PI, motivo `no_sq_or_cpf`, rota `nenhuma`
- `subtenente-luiz-carlos`, SQ não resolvido, Governador/TO, motivo `no_sq_or_cpf`, rota `nenhuma`
- `witer-naves`, SQ não resolvido, Governador/TO, motivo `no_sq_or_cpf`, rota `nenhuma`
- `yuri-ezequiel`, SQ não resolvido, Governador/PB, motivo `no_sq_or_cpf`, rota `nenhuma`

## Divergência herdada do PR #203

O precedente ligou o SQ presidencial `280002540694`, confirmado no snapshot como Renan Santos, ao slug `renan-filho`. Esta carga não reutiliza esse par. Renan Santos entra somente com o SQ e CPF concordantes; Renan Filho entra somente se o CPF dele resolver o próprio SQ no `consulta_cand`.

## Limite desta fase

Ausência de linha no ZIP continua transitória. `patrimonio_ausencia_oficial` fica intocada e será tratada apenas na Fase B, com snapshot separado de 17/08 ou posterior.
