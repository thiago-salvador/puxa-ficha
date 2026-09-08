import { StatePrograms } from "@/components/StatePrograms"
import { StatePolls } from "@/components/StatePolls"
import { SlashDivider } from "@/components/SlashDivider"
import { loadPresidentialPolls, loadPresidentialPrograms } from "@/lib/presidential-election-sections"
import type { StateProgramCandidate } from "@/lib/state-programs"

export async function PresidentialElectionSections({ candidates, unavailable = false }: {
  candidates: StateProgramCandidate[]
  unavailable?: boolean
}) {
  const [programs, polls] = await Promise.all([
    loadPresidentialPrograms(candidates)
      .then(data => ({ data, unavailable: false }))
      .catch(() => {
        console.error("Presidential programs could not be loaded")
        return { data: [], unavailable: true }
      }),
    Promise.resolve().then(() => loadPresidentialPolls())
      .then(data => ({ data, unavailable: false }))
      .catch(() => {
        console.error("Presidential polls could not be loaded")
        return { data: [], unavailable: true }
      }),
  ])

  return <div className="mx-auto max-w-7xl space-y-12 px-5 pb-12 md:px-12">
    <SlashDivider />
    <StatePrograms programs={programs.data} unavailable={unavailable || programs.unavailable} showContext={false} />
    <SlashDivider />
    <StatePolls polls={polls.data} unavailable={polls.unavailable} />
  </div>
}
