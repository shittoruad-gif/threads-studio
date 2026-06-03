import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { generateHooks } from "@shared/generator";
import { ProjectInputs } from "@shared/types";
import { Lightbulb, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface AIAssistantProps {
  inputs: ProjectInputs;
}

// ハッシュタグ（#）はThreadsで業者っぽさを出し到達も伸びないため、本ツールでは一切使わない方針。
// 以前あったハッシュタグ生成機能は撤去し、フック案生成のみ提供する。
export function AIAssistant({ inputs }: AIAssistantProps) {
  const [hooks, setHooks] = useState<string[]>([]);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const handleGenerateHooks = () => {
    const generated = generateHooks(inputs);
    setHooks(generated);
    toast.success("フック案を生成しました");
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    toast.success("コピーしました");
    setTimeout(() => setCopiedItem(null), 2000);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            フック案
          </CardTitle>
          <CardDescription>
            読者の注意を引く1行目のフレーズ案を生成します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateHooks}
            variant="outline"
            className="w-full"
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            フック案を生成
          </Button>
          {hooks.length > 0 && (
            <div className="space-y-2">
              {hooks.map((hook, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between p-3 rounded-lg bg-secondary/50 border border-border gap-2"
                >
                  <span className="text-sm flex-1">{hook}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => handleCopy(hook, `hook-${idx}`)}
                  >
                    {copiedItem === `hook-${idx}` ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
