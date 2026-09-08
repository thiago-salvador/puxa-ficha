import { HomeRecentUpdates } from "@/components/HomeRecentUpdates"
import { getVerifiedCandidateUpdates } from "@/lib/verified-candidate-updates-data"

export async function HomeRecentUpdatesData() {
  return <HomeRecentUpdates resource={await getVerifiedCandidateUpdates()} />
}
