# Governanca de Inteligencia Artificial

Documento de governanca de IA do PuxaFicha, cobrindo classificacao de risco, politica de uso e controles.
Referencia: ISO/IEC 42001:2023.

**Data de elaboracao**: 2026-04-03
**Responsavel**: Thiago Salvador
**Proxima revisao**: 2026-07-01

---

## 1. Inventario de sistemas de IA

| Sistema | Descricao | Modelo | Entrada | Saida | Em producao? |
| --- | --- | --- | --- | --- | --- |
| Geracao de pontos_atencao | Gera alertas editoriais (contradicoes, patrimonios incompativeis, escandalos, feitos positivos) a partir de dados estruturados do candidato | Claude (Anthropic) | Dados do banco (patrimonio, votacoes, historico, processos) | Texto: titulo + descricao + categoria + gravidade | Sim, com gate de revisao |

**Nao ha IA em producao para:**
- Ranking ou ordenacao de candidatos
- Recomendacao de voto
- Classificacao automatica de ideologia
- Moderacao de conteudo de terceiros
- Decisoes automatizadas sem revisao humana

---

## 2. Classificacao de risco

### Metodologia

Classificacao baseada no impacto potencial da saida da IA sobre:
- **Reputacao de individuos**: a saida pode afetar a reputacao de candidatos a cargos publicos
- **Decisao do eleitor**: a saida pode influenciar a percepcao do eleitor sobre o candidato
- **Risco legal**: informacao incorreta sobre politico pode gerar acao judicial
- **Confianca na plataforma**: erro de IA mina credibilidade do projeto inteiro

### Classificacao por sistema

| Sistema | Nivel de risco | Justificativa |
| --- | --- | --- |
| Pontos de atencao (categoria: escandalo, processo_grave, patrimonio_incompativel, contradicao, conflito_interesse) | **Alto** | Afirmacoes negativas sobre individuo publico. Erro = desinformacao + risco legal. Impacto reputacional direto. |
| Pontos de atencao (categoria: mudanca_posicao) | **Medio** | Factual mas interpretativo. Menos risco reputacional que acusacao. |
| Pontos de atencao (categoria: feito_positivo) | **Medio** | Afirmacao positiva. Erro = inflacao de merito, mas risco legal menor. |
| Perfis | **Medio** | Resumo biografico. Erro = informacao incorreta, mas normalmente verificavel. |

### Controles por nivel de risco

| Nivel | Controles obrigatorios |
| --- | --- |
| **Alto** | Revisao humana individual obrigatoria antes de publicacao. Badge "Gerado por IA" visivel. Gate SQL bloqueando publicacao ate `verificado = true`. Fontes devem ser verificaveis. |
| **Medio** | Revisao humana obrigatoria (pode ser em lote para categorias homogeenas). Badge "Gerado por IA" visivel. Gate SQL ativo. |
| **Baixo** | Revisao humana recomendada. Badge visivel. Gate SQL ativo. |

---

## 3. Politica de uso de IA

### 3.1 Principios

1. **IA e ferramenta, nao autor.** A responsabilidade editorial e do projeto. IA gera rascunhos, humanos decidem o que publica.
2. **Transparencia e obrigatoria.** Todo conteudo gerado ou assistido por IA deve ser identificavel pelo usuario final (badge na interface) e rastreavel internamente (`gerado_por` no banco).
3. **Revisao humana antes de publicacao.** Nenhum conteudo gerado por IA aparece na superficie publica sem `verificado = true`.
4. **Proporcionalidade.** O nivel de revisao e proporcional ao risco: acusacoes exigem verificacao individual, perfis podem ser revisados em lote.
5. **Sem decisoes automatizadas.** IA nao decide ranking, nao recomenda voto, nao classifica ideologia, nao modera conteudo.

### 3.2 Usos permitidos

| Uso | Condicao |
| --- | --- |
| Gerar pontos de atencao (alertas editoriais) | Com `gerado_por: "ia"`, `verificado: false`. Revisao humana antes de publicar |
| Gerar resumos de perfil | Com `gerado_por: "ia"`, `verificado: false`. Revisao humana antes de publicar |
| Auxiliar pipeline de dados (parsing, normalizacao) | Sem restricao. Nao gera conteudo editorial |
| Responder perguntas internas de desenvolvimento | Sem restricao. Nao afeta dados publicos |

### 3.3 Usos proibidos

| Uso | Motivo |
| --- | --- |
| Gerar analises editoriais finais sem revisao | Risco de alucinacao sobre politicos. Dano reputacional e legal |
| Rankear ou ordenar candidatos por "qualidade" | Implica julgamento de valor que a plataforma nao deve automatizar |
| Recomendar voto | Fora do escopo e potencialmente ilegal em contexto eleitoral |
| Classificar ideologia automaticamente | Reducao simplista e potencialmente incorreta |
| Gerar conteudo com `gerado_por: "curadoria"` | Fraude de atribuicao. IA deve ser marcada como IA |
| Moderar ou censurar conteudo de terceiros | Nao ha conteudo de terceiros na plataforma, mas caso exista, IA nao modera |

### 3.4 Regras de atribuicao

| Quem gerou | `gerado_por` | `verificado` |
| --- | --- | --- |
| Humano (Thiago ou colaborador) | `"curadoria"` | `true` ou `false` conforme revisao |
| IA (qualquer modelo) | `"ia"` | Sempre `false` ate revisao humana |
| Pipeline automatico (regras, sem IA) | `"automatico"` | `false` ate revisao |
| IA + edicao humana | `"ia"` | `true` apos edicao e aprovacao |

**Regra de ouro:** na duvida, marcar como `"ia"`. Nunca inflar atribuicao.

### 3.5 Controles tecnicos implementados

| Controle | Onde | Status |
| --- | --- | --- |
| Campo `gerado_por` obrigatorio | `pontos_atencao` (schema) | Ativo |
| Campo `verificado` com default false | `pontos_atencao` (schema) | Ativo |
| Gate SQL: IA nao verificada invisivel | `is_public_attention_point()` (RLS + views) | Ativo |
| Gate app: segunda camada de filtro | `isPublicAttentionPoint()` em `api.ts` | Ativo |
| Badge "Gerado por IA" na interface | `CandidatoProfile.tsx` | Ativo |
| Coluna `publicavel` no candidato | Gate fail-closed independente | Ativo |
| Regra de projeto proibindo publicacao de IA nao verificada | `AGENTS.md` e `CLAUDE.md` | Ativo |

### 3.6 Processo de revisao

```
IA gera ponto
    |
    v
Banco: gerado_por="ia", verificado=false
    |
    v
Gate SQL: invisivel na superficie publica
    |
    v
Revisor humano (docs/compliance/revisao-pontos-ia.md)
    |
    ├── Aprovar: verificado=true → visivel com badge "Gerado por IA"
    ├── Editar + Aprovar: corrigir texto, verificado=true → visivel corrigido
    ├── Rejeitar: visivel=false → invisivel em tudo
    └── Pular: sem mudanca → continua invisivel no publico
```

---

## 4. Monitoramento e metricas

| Metrica | Como medir | Meta |
| --- | --- | --- |
| Taxa de rejeicao de pontos de IA | Rejeitados / Total gerados | < 20% (se > 20%, prompt precisa de ajuste) |
| Tempo medio de revisao | Data de geracao ate verificado=true | < 7 dias para criticos, < 30 dias para demais |
| Pontos publicados com erro pos-revisao | Reportados por usuarios ou identificados internamente | 0 |
| Cobertura de badge | Pontos de IA visiveis com badge / Total de IA visiveis | 100% |

---

## 5. Revisao desta politica

- Revisar a cada 3 meses ou quando houver mudanca no uso de IA
- Revisar imediatamente se: novo modelo for introduzido, novo tipo de saida for adicionado, ou incidente relacionado a IA ocorrer
- Proxima revisao: 2026-07-01
