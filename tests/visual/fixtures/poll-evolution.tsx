import { createRoot } from "react-dom/client"
import { StatePolls } from "../../../src/components/StatePolls"
import { fixturePoll } from "../../fixtures/poll-series"

let polls = [
  fixturePoll('2026-08-25', [30, 44, 12]), fixturePoll('2026-08-28', [32, 40, 8]),
  fixturePoll('2026-09-01', [32, 42, 10]), fixturePoll('2026-09-03', [36, 38, 8]),
  fixturePoll('2026-09-08', [34, 40, 9]), fixturePoll('2026-09-10', [36, 38, 7]),
  fixturePoll('2026-09-15', [36, 39, 8]), fixturePoll('2026-09-17', [40, 35, 6]),
].map((poll, index) => ({ ...poll, instituto: { ...poll.instituto, value: index % 2 ? 'Instituto B' : 'Instituto A' }, registration: { ...poll.registration, code: { ...poll.registration.code, value: `BR-${90001 + index}/26` } } }))
if (new URLSearchParams(location.search).has('missing')) {
  polls = [polls.at(-1)!]
  polls.at(-1)!.scenario.resultados[1].valuePercent = 0
  polls.at(-1)!.scenario.resultados[2].valuePercent = null
}
if (new URLSearchParams(location.search).has('partial')) {
  polls = polls.slice(-2)
  polls[0].scenario.resultados[2].valuePercent = null
}

createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 1240, margin: "32px auto", padding: "0 24px" }}>
  <p style={{ marginBottom: 20 }}>Teste de interface com dados fictícios. Esta página não faz parte do site.</p>
  <StatePolls polls={polls} />
</main>)
