import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { generateHashtags, generateHooks } from "@shared/generator";
import { ProjectInputs } from "@shared/types";
import { Hash, Lightbulb, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface AIAssistantProps {
  inputs: ProjectInputs;
}

export function AIAssistant({ inputs }: AIAssistantProps) {
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hooks, setHooks] = useState<string[]>([]);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const handleGenerateHashtags = () => {
    const generated = generateHashtags(inputs);
    setHashtags(generated);
    toast.success("ハッシュタグを生成しました");
  };

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
            <Hash className="w-5 h-5" />
            ハッシュタグ候補
          </CardTitle>
          <CardDescription>
            入力内容から関連するハッシュタグを生成します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerateHashtags}
            variant="outline"
            className="w-full"
          >
            <Hash className="w-4 h-4 mr-2" />
            ハッシュタグを生成
          </Button>
          {hashtags.length > 0 && (
            <div className="space-y-2">
              {hashtags.map((tag, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <span className="text-sm font-medium">{tag}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(tag, `hashtag-${idx}`)}
                  >
                    {copiedItem === `hashtag-${idx}` ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleCopy(hashtags.join(" "), "all-hashtags")}
              >
                {copiedItem === "all-hashtags" ? (
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                すべてコピー
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
