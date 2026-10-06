import { StatePrograms, type AbaFinalistasProgramas } from "@/components/StatePrograms"
import { StatePolls } from "@/components/StatePolls"
import { SlashDivider } from "@/components/SlashDivider"
import { loadPresidentialPolls, loadPresidentialPrograms } from "@/lib/presidential-election-sections"
import type { StateProgramCandidate } from "@/lib/state-programs"
import { loadProgramRunningMates } from "@/lib/program-running-mates"

export async function PresidentialElectionSections({ candidates, unavailable = false, resultadoEleitoralPublicado = false, mostrarPesquisas = true, abaFinalistas }: {
  abaFinalistas?: AbaFinalistasProgramas
  candidates: (StateProgramCandidate & { foto_url?: string | null; foto_pb?: boolean })[]
  unavailable?: boolean
  resultadoEleitoralPublicado?: boolean
  /** false tira "A evolução da disputa" (StatePolls) e nem carrega o catálogo; a home do 2º turno usa assim. */
  mostrarPesquisas?: boolean
}) {
  const [programs, polls, runningMates] = await Promise.all([
    loadPresidentialPrograms(candidates)
      .then(data => ({ data, unavailable: false }))
      .catch(() => {
        console.error("Presidential programs could not be loaded")
        return { data: [], unavailable: true }
      }),
    Promise.resolve().then(() => (mostrarPesquisas ? loadPresidentialPolls() : []))
      .then(data => ({ data, unavailable: false }))
      .catch(() => {
        console.error("Presidential polls could not be loaded")
        return { data: [], unavailable: true }
      }),
    loadProgramRunningMates(candidates.map(({ slug }) => slug), "Presidente", "BR"),
  ])

  return <div className="mx-auto max-w-7xl space-y-12 px-5 pb-12 md:px-12">
    <SlashDivider />
    <StatePrograms scopeTitle="Presidência da República" programs={programs.data} runningMates={runningMates} unavailable={unavailable || programs.unavailable} showContext={false} abaFinalistas={abaFinalistas} />
    {mostrarPesquisas && <>
      <SlashDivider />
      <StatePolls polls={polls.data} candidates={candidates} unavailable={polls.unavailable} resultadoEleitoralPublicado={resultadoEleitoralPublicado} />
    </>}
  </div>
}
