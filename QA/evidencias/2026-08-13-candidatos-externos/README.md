# Reconciliação dos 34 nomes fora da atribuição automática — 13/08/2026

## Objetivo e contribuição ao lançamento

Transformar a lacuna herdada de “34 nomes externos” em decisões nominais e
rastreáveis. Isso aproxima o projeto da cobertura pública completa sem promover
identidade por semelhança e sem tratar ausência no snapshot como desistência.

## Denominador versionado e reproduzível

- lista independente: 206 registros;
- titulares sem ficha correspondente na base: 46;
- entre os 46, titulares oficiais novos presentes na lista: 11;
- uma linha reclassificada como vice oficial (Vera Lúcia/CE): 1;
- coorte residual auditada: **34**;
- Pedro Brito/CE completa os 12 perfis oficiais novos, mas não constava da lista independente;
- regra: `base_unmatched` e (sem atribuição ótima no snapshot TSE de 12/08 ou
  `official_conflict_review`);
- Vera Lúcia/CE não entra: o snapshot a contradiz como titular e a confirma como
  vice de Pedro Brito.

A derivação nominal das 206 linhas está versionada em `derivacao-206.json`. O teste
`tests/candidatos-externos-34.test.ts` recalcula 206 → 46 → 11 + 1 exclusão por papel + 34 e exige que
as 34 ordens residuais coincidam exatamente com `coorte-34.json`; nenhum
artefato em `/tmp` é necessário para reproduzir o denominador.

## Fonte primária e frescor

- TSE Dados Abertos: `consulta_cand_2026.zip`;
- geração interna dos CSVs: `2026-08-12 19:30:33 -03:00`;
- SHA-256: `686fe1717dd0b860d714f878bf3d75a388478ebab2a56a2f963e6bba50ff0ce7`;
- uma resposta CDN atrasada foi descartada após leitura de `DT_GERACAO` e
  `HH_GERACAO`; uma requisição sem cache devolveu o snapshot acima.

## Resultado

- **30** candidaturas confirmadas por convenção, partido ou imprensa verificável,
  ainda ausentes do snapshot lido;
- **2** casos resolvidos pelo próprio snapshot e por chave independente:
  Robson Raimundo/DF e Jeremias Cosmo/PE;
- **2** casos em quarentena: Cadu de Lula/RN e Delegado Huggo/CE, pois
  cargo/UF/nome público coincidem, mas a chave independente de identidade ainda
  não basta para promover os vínculos;
- zero linha inconclusiva e zero titular classificado como retirado.

## Divergências de composição que não rebaixam o titular

- Flávio Roscoe/MG continua confirmado; Charlles Evangelista deixou a vice e foi
  substituído por Ellen Miziara;
- Danilo Soares/CE está confirmado; as fontes lidas informavam que a vice ainda
  não estava definida, portanto o nome de vice da lista não deve ser promovido
  sem fonte posterior.

## Artefatos e integridade

- `derivacao-206.json`: classificação compacta das 206 linhas e partição 46 → 11 titulares oficiais novos na lista + 1 vice oficial + 34 residuais; Pedro Brito é o 12º perfil oficial novo e está fora da lista;
- `coorte-34.json`: denominador residual e motivos de entrada;
- `desfechos-34.json`: fonte, trecho literal, consultas e decisão por nome;
- `registros-oficiais-5.json`: recorte sem PII que reproduz os cinco casos lidos diretamente do TSE;
- `coorte-34.json`: `1986780c27d06db0fc53e1bf6a2ecd779a55b44ea96696e57dddc4bea705e7ba`;
- `desfechos-34.json`: `c64173a7257178de1a49cccf17f28dd584a9f421781107e06fd6aac49b03cf75`;
- `derivacao-206.json`: `81aa8fb6ceddf7e3e123dc9c69141a0e47fac2374a1a019bb410e1f2a29cce12`;
- `registros-oficiais-5.json`: `cdd24ef1432a5887411d56bbcf7c28c64b9e07d265b54e831e928962726720ea`.

## Próxima ação de dados

Os 30 confirmados fora do snapshot podem entrar como `pre-candidato`, com fonte nominal e data,
sem fingir pedido de registro TSE. Os dois resolvidos permanecem vinculados na carga oficial
de chapas. Cadu e Delegado Huggo permanecem fail-closed. A composição de Roscoe deve usar Ellen
Miziara; a vice de Danilo Soares permanece pendente até fonte conclusiva.
