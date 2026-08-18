# Proposta de autoauditoria não aplicável

Os dois SQLs deste diretório preservam o experimento que materializa o recorte
publicável de trajetória e votações a partir do dataset atual.

A proposta foi retirada do diretório de migrations porque ausência no dataset
não comprova que uma fonte externa foi consultada. Aplicá-la converteria 88
trajetórias e 159 votações de `nunca_verificado` para `vazio_confirmado` sem
evidência de coleta subjacente.

O harness PostgreSQL continua provando cardinalidade e rollback apenas para
documentar o comportamento técnico. Estes arquivos não entram no replay, no
ledger, no recorte de allowlist nem no release.
