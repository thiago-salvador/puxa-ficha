# Gates: revisão adversarial

Scope: tentar quebrar a fila em concorrência, permissões, eventos hostis e falhas parciais.

- [x] G1: Testes cobrem corrida entre dois runs e preservam um único ativo.
  EVIDENCE: PASS. Merge normal e revert relêem base/head/labels; testes intercalam base stale e remoção do lock do owner, ambos com zero merge.
- [x] G2: PR de fork não executa código não confiável com token de escrita.
  EVIDENCE: PASS. O head não roda no pull_request_target. Smokes executam o trustedSha anterior em job sem secrets; publisher privilegiado usa runner novo sem checkout; workflows, config e scripts do coordenador ficam bloqueados pelo gate sensível.
- [x] G3: Crash entre merge e persistência não libera o próximo PR.
  EVIDENCE: PASS. Após a correção, a sonda com PR fechado e mergedAt, ainda active/pre-merge, não produziu segundo MERGE e manteve o PR seguinte em WAIT.
- [x] G4: Falha de notificação não e interpretada como sucesso operacional.
  EVIDENCE: PASS. Exceção em upsertIncident manteve resultado não-success, enquanto Instant Rollback e criação do revert ainda foram tentados.
- [x] G5: Migration sem rollback permanece bloqueada.
  EVIDENCE: PASS. Com requireNamedRemoteWriteApproval=true, manifesto autoafirmado é rejeitado como named-remote-write-approval-required e a migration não chega ao merge automático.

- [x] G6: O consumidor de recovery executa checks, promoção, readback e smokes do SHA restaurado.
  EVIDENCE: PASS local. Consumer existe, jq real compila e roda com irmãos skipped, promoção/readback e smokes usam jobs isolados; prova live do hold permanece gate externo de ativação.
