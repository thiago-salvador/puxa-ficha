import { StatePrograms } from "@/components/StatePrograms"
import { StatePolls } from "@/components/StatePolls"
import { SlashDivider } from "@/components/SlashDivider"
import { loadPresidentialPolls, loadPresidentialPrograms } from "@/lib/presidential-election-sections"
import type { StateProgramCandidate } from "@/lib/state-programs"
import { loadProgramRunningMates } from "@/lib/program-running-mates"

export async function PresidentialElectionSections({ candidates, unavailable = false }: {
  candidates: (StateProgramCandidate & { foto_url?: string | null })[]
  unavailable?: boolean
}) {
  const [programs, polls, runningMates] = await Promise.all([
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
    loadProgramRunningMates(candidates.map(({ slug }) => slug), "Presidente", "BR"),
  ])

  return <div className="mx-auto max-w-7xl space-y-12 px-5 pb-12 md:px-12">
    <SlashDivider />
    <StatePrograms scopeTitle="Presidência da República" programs={programs.data} runningMates={runningMates} unavailable={unavailable || programs.unavailable} showContext={false} />
    <SlashDivider />
    <StatePolls polls={polls.data} candidates={candidates} unavailable={polls.unavailable} />
  </div>
}
