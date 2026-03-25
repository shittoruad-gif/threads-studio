import { Skeleton } from './ui/skeleton';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar skeleton */}
      <div className="w-[260px] border-r border-gray-200 bg-white p-4 space-y-6 hidden md:block">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-2 h-16">
          <Skeleton className="h-8 w-8 rounded-lg bg-gray-100" />
          <Skeleton className="h-4 w-28 bg-gray-100" />
        </div>

        {/* Menu section label */}
        <Skeleton className="h-3 w-16 ml-4 bg-gray-100" />

        {/* Menu items */}
        <div className="space-y-1 px-2">
          <Skeleton className="h-10 w-full rounded-lg bg-gray-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-gray-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-gray-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-gray-100" />
        </div>

        {/* Second section */}
        <Skeleton className="h-3 w-20 ml-4 bg-gray-100" />
        <div className="space-y-1 px-2">
          <Skeleton className="h-10 w-full rounded-lg bg-gray-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-gray-100" />
        </div>

        {/* User profile area at bottom */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-3 px-2">
            <Skeleton className="h-8 w-8 rounded-full bg-gray-100" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20 bg-gray-100" />
              <Skeleton className="h-2 w-32 bg-gray-100" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1">
        {/* Header */}
        <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6">
          <Skeleton className="h-4 w-32 bg-gray-100" />
        </div>
        
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48 rounded-lg bg-gray-100" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28 rounded-xl bg-white border border-gray-200" />
            <Skeleton className="h-28 rounded-xl bg-white border border-gray-200" />
            <Skeleton className="h-28 rounded-xl bg-white border border-gray-200" />
            <Skeleton className="h-28 rounded-xl bg-white border border-gray-200" />
          </div>
          <Skeleton className="h-64 rounded-xl bg-white border border-gray-200" />
        </div>
      </div>
    </div>
  );
}
