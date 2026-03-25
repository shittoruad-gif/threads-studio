import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpTooltipProps {
  content: string;
}

export default function HelpTooltip({ content }: HelpTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-primary transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="tooltip max-w-xs">
          <p className="text-sm">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
