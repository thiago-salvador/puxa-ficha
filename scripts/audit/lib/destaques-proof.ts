import { createHash } from "node:crypto"
import type { DestaquesDaFicha } from "../../../src/lib/destaques-ficha"
import { provenienciaDoMandato } from "../../../src/lib/destaques-ficha"

/**
 * Assinatura semântica do conteúdo que a aba Destaques publica.
 *
 * O recorte é explícito para não depender de campos internos que não chegam à
 * tela, mas inclui cada identidade, texto, fonte e estado que sustenta o DOM.
 */
export function assinaturaConteudoDestaques(destaques: DestaquesDaFicha): string {
  const payload = {
    pontos: destaques.pontosAtencao.map((item) => ({
      id: item.id,
      categoria: item.categoria,
      titulo: item.titulo,
      descricao: item.descricao,
      fontes: item.fontes.map((fonte) => ({ titulo: fonte.titulo, url: fonte.url, data: fonte.data })),
      gravidade: item.gravidade,
      verificado: item.verificado,
      gerado_por: item.gerado_por,
    })),
    sancoes: [...destaques.sancoesVigentes, ...destaques.sancoesExpiradas].map((item) => ({
      id: item.id,
      estado: destaques.sancoesExpiradas.includes(item) ? "expirada" : "vigente",
      tipo: item.tipo,
      descricao: item.descricao,
      orgao_sancionador: item.orgao_sancionador,
      data_inicio: item.data_inicio,
      data_fim: item.data_fim,
    })),
    processos: destaques.processos.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      tribunal: item.tribunal,
      numero_processo: item.numero_processo,
      descricao: item.descricao,
      status: item.status,
      fonte: item.fonte ?? null,
      url_fonte: item.url_fonte ?? null,
    })),
    mandatos: destaques.mandatos.map((item) => {
      const proveniencia = provenienciaDoMandato(item)
      return {
        id: item.id,
        cargo: item.cargo,
        periodo_inicio: item.periodo_inicio,
        periodo_fim: item.periodo_fim,
        partido: item.partido,
        estado: item.estado,
        proveniencia: proveniencia.chave,
      }
    }),
    patrimonio: destaques.patrimonioPublicado.map((item) => ({
      ano: item.ano,
      valor_total: item.valorTotal,
      fonte_url: item.fonteUrl,
    })),
    votacoes: destaques.votacoes.map((item) => ({
      id: item.id,
      votacao_id: item.votacao_id,
      voto: item.voto,
      titulo: item.votacao?.titulo ?? null,
      descricao: item.votacao?.descricao ?? null,
      casa: item.votacao?.casa ?? null,
      data_votacao: item.votacao?.data_votacao ?? null,
    })),
    fontes: destaques.fontes.map((item) => ({
      chave: item.chave,
      estado: item.estado,
      categoria: item.categoria,
      proveniencia: item.proveniencia ?? null,
    })),
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}
