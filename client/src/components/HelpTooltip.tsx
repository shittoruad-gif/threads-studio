import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
}

export default function HelpTooltip({ content, side = "top" }: HelpTooltipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
          aria-label="ヘルプ"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-xs bg-amber-50 text-amber-900 border border-amber-200 shadow-lg"
      >
        <p className="text-sm leading-relaxed">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}
