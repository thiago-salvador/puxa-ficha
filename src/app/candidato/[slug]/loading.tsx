import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-5 pt-24 md:px-12">
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-12">
          <Skeleton className="h-[420px] w-[315px] shrink-0 rounded-[20px]" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-80" />
            <Skeleton className="h-4 w-60" />
            <Skeleton className="mt-4 h-24 w-full max-w-2xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
