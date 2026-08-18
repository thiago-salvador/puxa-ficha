import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero skeleton */}
      <Skeleton className="h-[50vh] w-full rounded-none" />
      {/* Section header */}
      <div className="mx-auto max-w-7xl px-5 pt-12 md:px-12">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-10 w-64" />
        <Skeleton className="mt-6 h-px w-full" />
      </div>
      {/* Card grid */}
      <div className="mx-auto max-w-7xl px-5 pt-8 md:px-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-[20px]" />
          ))}
        </div>
      </div>
    </div>
  )
}
