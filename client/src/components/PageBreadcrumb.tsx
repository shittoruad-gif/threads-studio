import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home } from "lucide-react";
import { useLocation } from "wouter";

export interface BreadcrumbItemType {
  label: string;
  href?: string;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItemType[];
  className?: string;
}

export default function PageBreadcrumb({ items, className = "" }: PageBreadcrumbProps) {
  const [, setLocation] = useLocation();

  return (
    <Breadcrumb className={`mb-6 ${className}`}>
      <BreadcrumbList>
        {/* Home Link */}
        <BreadcrumbItem>
          <BreadcrumbLink
            onClick={() => setLocation("/dashboard")}
            className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>ホーム</span>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {/* Render breadcrumb items */}
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <div key={index} className="flex items-center">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage className="font-medium">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    onClick={() => item.href && setLocation(item.href)}
                    className="cursor-pointer hover:text-primary transition-colors"
                  >
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
