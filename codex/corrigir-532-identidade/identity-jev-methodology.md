# Jev same-person review for projection 532

Scope: 91 identity-risk profiles from `revisao-divergencias.json`. The Jev state contains no CPF. Questions were asked once per profile in 12 candidate-grouped batches of at most 8, using `jev-1.13.0`; all 12 `jev.py lint` runs exited 0 with no errors (only informational path-hint advisories), then all 12 `jev.py ask` calls returned a probability.

## Results

- `p >= 0.85`: 0 profiles; no “proposta: mesma pessoa” was emitted because the threshold plus agreeing code evidence was never met.
- `0.35 <= p < 0.85`: 37 profiles in review.
- `p < 0.35`: 54 Jev outputs in the likely-different bucket.
- 14 profiles had no identity state and only a patrimonial divergence. Their returned p values are retained, but their disposition remains review because the available evidence cannot identify a person.
- The 21 SQ 2026 proposals remain in `propostas.json`; no profile was written based on Jev.

Per-profile p, bucket and disposition are in `identity-jev-review.json` and are linked from every profile in `revisao-divergencias.json`. Raw CPF-free state, questions and outputs are archived outside the repository.
