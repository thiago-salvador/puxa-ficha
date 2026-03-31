import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <Skeleton className="h-[35vh] w-full rounded-none" />
      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <Skeleton className="h-px w-full" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
