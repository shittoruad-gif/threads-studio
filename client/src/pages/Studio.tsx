import { AIAssistant } from "@/components/AIAssistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateThread } from "@shared/generator";
import { TEMPLATES } from "@shared/templates";
import { GenerateOptions, Post, ProjectInputs, Tone } from "@shared/types";
import { ArrowLeft, Sparkles } from "lucide-react";
import { nanoid } from "nanoid";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Studio() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const templateId = searchParams.get("template");

  const template = TEMPLATES.find((t) => t.id === templateId);

  const [inputs, setInputs] = useState<ProjectInputs>({});
  const [tone, setTone] = useState<Tone>("professional");
  const [maxCharsPerPost, setMaxCharsPerPost] = useState<number>(280);
  const [postCount, setPostCount] = useState<number>(5);

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>テンプレートが見つかりません</CardTitle>
            <CardDescription>有効なテンプレートを選択してください</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")}>テンプレート選択に戻る</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleInputChange = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerate = () => {
    const options: GenerateOptions = {
      tone,
      maxCharsPerPost,
      postCount,
    };

    const posts: Post[] = generateThread(template, inputs, options);

    const projectId = nanoid();
    const project = {
      id: projectId,
      title: inputs.storeName || `${template.name} - ${new Date().toLocaleDateString()}`,
      templateId: template.id,
      inputs,
      posts,
      tags: [],
      tone,
      maxCharsPerPost,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // エディタに遷移（プロジェクトデータをLocalStorageに一時保存）
    sessionStorage.setItem('currentProject', JSON.stringify(project));
    setLocation(`/editor?project=${projectId}`);
  };

  const isFormValid = template.requiredFields
    .filter((f) => f.required)
    .every((f) => inputs[f.key]?.trim());

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 right-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '1s'}} />
        <div className="absolute bottom-10 left-20 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '3s'}} />
      </div>
      
      <div className="container py-12 relative z-10">
        <Button
          variant="ghost"
          className="mb-6 glass hover-lift"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          テンプレート選択に戻る
        </Button>

        <div className="max-w-3xl mx-auto scale-in">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4 inline-block float">{template.icon}</div>
            <h1 className="text-4xl font-bold mb-2">{template.name}</h1>
            <p className="text-muted-foreground">{template.description}</p>
          </div>

          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle>入力フォーム</CardTitle>
              <CardDescription>必要な情報を入力してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {template.requiredFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.multiline ? (
                    <Textarea
                      id={field.key}
                      placeholder={field.placeholder}
                      value={inputs[field.key] || ""}
                      onChange={(e) => handleInputChange(field.key, e.target.value)}
                      rows={4}
                    />
                  ) : (
                    <Input
                      id={field.key}
                      placeholder={field.placeholder}
                      value={inputs[field.key] || ""}
                      onChange={(e) => handleInputChange(field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle>生成オプション</CardTitle>
              <CardDescription>トーンと文字数制限を設定してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="tone">トーン</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger id="tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="polite">丁寧</SelectItem>
                    <SelectItem value="casual">カジュアル</SelectItem>
                    <SelectItem value="professional">専門寄り</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postCount">ポスト数</Label>
                  <Input
                    id="postCount"
                    type="number"
                    min={1}
                    max={10}
                    value={postCount}
                    onChange={(e) => setPostCount(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxChars">1ポストの最大文字数</Label>
                  <Input
                    id="maxChars"
                    type="number"
                    min={50}
                    max={500}
                    value={maxCharsPerPost}
                    onChange={(e) => setMaxCharsPerPost(Number(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Button
                size="lg"
                className="w-full gradient-bg hover-lift glow"
                onClick={handleGenerate}
                disabled={!isFormValid}
              >
                <Sparkles className="w-5 h-5 mr-2" />
                スレッドを生成
              </Button>
            </div>
            <div className="lg:col-span-1">
              <AIAssistant inputs={inputs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
