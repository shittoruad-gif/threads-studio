import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="w-[260px] border-r border-border bg-card p-4 space-y-6 hidden md:block">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-2 h-16">
          <Skeleton className="h-8 w-8 rounded-lg bg-muted" />
          <Skeleton className="h-4 w-28 bg-muted" />
        </div>

        {/* Menu section label */}
        <Skeleton className="h-3 w-16 ml-4 bg-muted" />

        {/* Menu items */}
        <div className="space-y-1 px-2">
          <Skeleton className="h-10 w-full rounded-lg bg-muted" />
          <Skeleton className="h-10 w-full rounded-lg bg-muted" />
          <Skeleton className="h-10 w-full rounded-lg bg-muted" />
          <Skeleton className="h-10 w-full rounded-lg bg-muted" />
        </div>

        {/* Second section */}
        <Skeleton className="h-3 w-20 ml-4 bg-muted" />
        <div className="space-y-1 px-2">
          <Skeleton className="h-10 w-full rounded-lg bg-muted" />
          <Skeleton className="h-10 w-full rounded-lg bg-muted" />
        </div>

        {/* User profile area at bottom */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-3 px-2">
            <Skeleton className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20 bg-muted" />
              <Skeleton className="h-2 w-32 bg-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1">
        {/* Header */}
        <div className="h-14 border-b border-border bg-card flex items-center px-6">
          <Skeleton className="h-4 w-32 bg-muted" />
        </div>
        
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48 rounded-lg bg-muted" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28 rounded-xl bg-card border border-border" />
            <Skeleton className="h-28 rounded-xl bg-card border border-border" />
            <Skeleton className="h-28 rounded-xl bg-card border border-border" />
            <Skeleton className="h-28 rounded-xl bg-card border border-border" />
          </div>
          <Skeleton className="h-64 rounded-xl bg-card border border-border" />
        </div>
      </div>
    </div>
  );
}
