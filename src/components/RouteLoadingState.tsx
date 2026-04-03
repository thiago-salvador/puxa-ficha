import { Skeleton } from "@/components/ui/skeleton"

export function RouteLoadingState({
  eyebrow,
}: {
  eyebrow: string
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-5 pt-24 md:px-12">
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 max-w-3xl space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
          <Skeleton className="h-16 w-full max-w-2xl" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[260px] rounded-[20px]" />
          ))}
        </div>
      </div>
    </div>
  )
}
