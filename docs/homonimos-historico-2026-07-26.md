# Histórico político contaminado por homônimo

**Data:** 26 de julho de 2026
**Origem:** apuração da pendência 1 do fechamento da
[auditoria de integridade](auditoria-integridade-2026-07-24.md) ("CPF divergente
de `jeronimo`"), que o laudo registrou sem descrever o efeito.
**Acesso ao banco:** somente leitura. Nenhuma linha foi alterada.

## O que o laudo não dizia

O laudo apontou o CPF divergente e o caminho de correção (reancorar e
reprocessar), mas não registrou **o que o CPF errado produziu na ficha**. Produziu
isto: seis candidaturas a Vereador atribuídas a Jerônimo Rodrigues, cada uma por
um partido diferente.

| Ano | Cargo | Partido | Observação gravada |
|---|---|---|---|
| 2000 | Vereador | PHS | Candidatura: SUPLENTE (TSE 2000) |
| 2004 | Vereador | PSDB | Candidatura: SUPLENTE (TSE 2004) |
| 2008 | Vereador | DEM | Candidatura: SUPLENTE (TSE 2008) |
| 2012 | Vereador | PTN | Candidatura: SUPLENTE (TSE 2012) |
| 2012 | Vice-Prefeito | **PT** | Candidatura: NÃO ELEITO (TSE 2012) |
| 2016 | Vereador | PMN | Candidatura municipal de 2016 pelo PMN |
| 2020 | Vereador | MDB | Candidatura: NÃO ELEITO (TSE 2020) |

As linhas em PT (Vice-Prefeito 2012, Secretário de Desenvolvimento Rural
2015-2018, Secretário de Educação 2019-2022, Governador desde 2023) são
coerentes entre si e com a trajetória pública do candidato.

## Por que isto não é troca de partido

Troca de partido é comum e não seria achado. O que descarta essa leitura:

1. **Colisão lógica em 2012.** A mesma pessoa aparece como candidata a
   Vice-Prefeito pelo PT e a Vereador pelo PTN na mesma eleição. Não é possível.
2. **Seis siglas em vinte anos**, todas fora do campo do PT (PHS, PSDB, DEM,
   PTN, PMN, MDB), para um quadro que ocupou duas secretarias em governos do PT
   na Bahia e se elegeu governador pelo partido.
3. **O padrão do resolver.** `scripts/lib/tse-resolver.ts` casa linha do TSE por
   `SQ_CANDIDATO`, depois por CPF, e só então por nome. Com o CPF divergente, o
   segundo degrau falha e a linha cai no casamento por nome, que junta homônimos.

Ou seja: o CPF errado não é um campo cosmético errado. Ele desliga a âncora que
separa pessoas com o mesmo nome, e o resultado é candidatura de terceiro exibida
na ficha de quem está no ar.

## A triagem: 8 suspeitos, 3 casos reais

A consulta que procura "candidatura a Vereador em sigla diferente da atual"
devolve oito fichas publicadas. Mas **troca de partido real produz exatamente a
mesma assinatura**, entao a consulta sozinha nao decide nada. Olhando trajetoria
a trajetoria, cinco delas se explicam sem homonimo nenhum.

### Contaminacao confirmada

| Slug | Linhas | O que fecha o diagnostico |
|---|---|---|
| `jeronimo` (PT/BA) | 6 | Colisao logica em 2012 (Vice-Prefeito pelo PT **e** Vereador pelo PTN na mesma eleicao), seis siglas fora do campo do PT em vinte anos, e **nenhuma** eleicao vencida |
| `maria-da-consolacao` (PSOL/MG) | 2 | Duas colisoes: 2012 Prefeito pelo PSOL **e** Vice-Prefeito pelo PSC; 2016 Prefeito pelo PSOL **e** Vereador pelo PT do B |

As oito linhas foram despublicadas na migration
[20260726160000](../supabase/migrations/20260726160000_despublicar_historico_por_homonimo.sql).

### Suspeito, sem colisao que feche

`professora-dorinha` (UNIAO/TO) tem duas candidaturas a vereadora suplente, em
2000 (PPB) e 2016 (PMDB). A de 2016 e atipica, porque ela era deputada federal
naquele momento. Nao e impossivel, e nao ha colisao. Fica marcada para consulta
ao TSE, sem alteracao.

### Troca de partido legitima, intocadas

| Slug | Trajetoria | Leitura |
|---|---|---|
| `clecio-luis` | Vereador PT 2004 (eleito), Vereador PSOL 2008 (eleito), Prefeito PSOL 2012 (eleito), Prefeito REDE 2016 (eleito) | Progressao limpa, todos eleitos |
| `dr-daniel` | Vereador PSDB 2012 e 2016 (eleito), Prefeito MDB 2021, Prefeito PSB 2024 | Progressao coerente |
| `adailton-furia` | Vereador PSDB 2008, Vereador PRB 2012 (eleito), Prefeito PRB 2016, Prefeito PSD 2020 (eleito) | Progressao coerente |
| `cleitinho` | Vereador PP 2008 (eleito), PP 2012, PT do B 2016, AVANTE 2020 (eleito) | Mesma cidade, troca de sigla normal |
| `marcos-rogerio` | Vereador PTB 2000, PPS 2004, PDT 2008 (eleito) | Progressao coerente |

O padrao que separa os dois grupos serve para a proxima triagem: **candidatura
por homonimo generico quase nunca vence eleicao e nao progride de cargo**. As
seis linhas do `jeronimo` sao todas suplente ou nao eleito, sem progressao
nenhuma; as cinco trajetorias legitimas tem eleicoes vencidas e sobem de
vereador para prefeito.

## Por que despublicar e nao deletar

Apagar linha de historico e afirmar que uma candidatura nao e daquela pessoa.
Errar nessa direcao tambem erra sobre pessoa real, no sentido oposto: esconde
mandato ou candidatura verdadeira. As linhas continuam no banco, com o motivo
gravado em `despublicacao_motivo`, e voltam com um `UPDATE`.

O par de colunas (`despublicado_em`, `despublicacao_motivo`) espelha o que a
migration `20260725153000` fez em `pontos_atencao`, para o mecanismo ser o mesmo
nas duas tabelas. O filtro que da efeito a ele esta em `src/lib/api.ts`, na
consulta de `historico_politico`.

## O guard-rail, aplicado

Antes, o degrau de nome do resolver era silencioso: a linha entrava na ficha sem
sinal nenhum de que a ancora era fraca. Agora, em
`scripts/lib/ingest-tse-historico.ts`, **linha nova resolvida por casamento de
nome nasce despublicada**, com o motivo gravado, esperando revisao.

A regra vale so no `INSERT`. No `UPDATE` a linha ja existe e pode ter sido
revisada ou curada a mao, e reescrever o estado a cada re-ingest desfaria decisao
humana em silencio, que e o mesmo defeito invertido.
`tests/historico-guard-homonimo.test.ts` trava as duas metades, mais o filtro da
consulta publica.

## O que segue aberto

1. **CPF oficial do `jeronimo`.** A API do DivulgaCandContas nao respondeu ao
   formato de consulta tentado em 26/07. Sem o numero verificado na fonte,
   corrigir `candidatos.cpf` seria chute. Enquanto isso, as linhas contaminadas
   estao fora do ar, que e o efeito pratico que importa para quem le a ficha.
2. **`professora-dorinha`**, descrita acima.
3. **Reprocessar com o CPF certo**, quando ele existir, para o resolver
   reancorar por CPF. Financiamento e patrimonio aceitam recorte por slug
   (`PF_TSE_FINANCIAMENTO_SLUGS`, `PF_TSE_PATRIMONIO_SLUGS`); historico nao tem
   esse recorte hoje.
