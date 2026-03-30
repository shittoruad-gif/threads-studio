import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "@shared/types";
import { ArrowLeft, Check, Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Export() {
  const [location, setLocation] = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  useEffect(() => {
    const storedProject = sessionStorage.getItem('exportProject');
    if (storedProject) {
      setProject(JSON.parse(storedProject) as Project);
      sessionStorage.removeItem('exportProject');
    } else {
      toast.error("プロジェクトが見つかりません");
      setLocation("/");
    }
  }, [location, setLocation]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  const exportAsText = () => {
    return project.posts.map((post, idx) => `[${idx + 1}]\n${post.content}`).join("\n\n---\n\n");
  };

  const exportAsJSON = () => {
    return JSON.stringify(project, null, 2);
  };

  const exportAsCSV = () => {
    const header = "番号,内容,文字数\n";
    const rows = project.posts
      .map((post, idx) => `${idx + 1},"${post.content.replace(/"/g, '""')}",${post.content.length}`)
      .join("\n");
    return header + rows;
  };

  const handleCopy = async (format: "text" | "json" | "csv") => {
    let content = "";
    switch (format) {
      case "text":
        content = exportAsText();
        break;
      case "json":
        content = exportAsJSON();
        break;
      case "csv":
        content = exportAsCSV();
        break;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedFormat(format);
      toast.success("クリップボードにコピーしました");
      setTimeout(() => setCopiedFormat(null), 2000);
    } catch (err) {
      toast.error("コピーに失敗しました。ブラウザの権限設定を確認してください。");
    }
  };

  const handleDownload = (format: "txt" | "json" | "csv") => {
    let content = "";
    let filename = "";
    let mimeType = "";

    switch (format) {
      case "txt":
        content = exportAsText();
        filename = `${project.title}.txt`;
        mimeType = "text/plain";
        break;
      case "json":
        content = exportAsJSON();
        filename = `${project.title}.json`;
        mimeType = "application/json";
        break;
      case "csv":
        content = exportAsCSV();
        filename = `${project.title}.csv`;
        mimeType = "text/csv";
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("ファイルをダウンロードしました");
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '0s'}} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '2s'}} />
      </div>
      
      <div className="container py-8 relative z-10">
        <Button
          variant="ghost"
          className="mb-6 glass hover-lift scale-in"
          onClick={() => {
            sessionStorage.setItem('currentProject', JSON.stringify(project));
            setLocation(`/editor?project=${project.id}`);
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          エディタに戻る
        </Button>

        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 scale-in">
            <h1 className="text-5xl font-bold mb-2">書き出し</h1>
            <p className="text-muted-foreground">スレッドを様々な形式で書き出し</p>
          </div>

          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle>{project.title}</CardTitle>
              <CardDescription>{project.posts.length} ポスト</CardDescription>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="glass-card hover-lift scale-in" style={{animationDelay: '0.1s'}}>
              <CardHeader>
                <CardTitle className="text-lg">テキスト形式</CardTitle>
                <CardDescription>シンプルなテキストファイル</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleCopy("text")}
                >
                  {copiedFormat === "text" ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  コピー
                </Button>
                <Button
                  variant="default"
                  className="w-full gradient-bg hover-lift"
                  onClick={() => handleDownload("txt")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  ダウンロード
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card hover-lift scale-in" style={{animationDelay: '0.2s'}}>
              <CardHeader>
                <CardTitle className="text-lg">JSON形式</CardTitle>
                <CardDescription>プログラムで扱いやすい形式</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleCopy("json")}
                >
                  {copiedFormat === "json" ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  コピー
                </Button>
                <Button
                  variant="default"
                  className="w-full gradient-bg hover-lift"
                  onClick={() => handleDownload("json")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  ダウンロード
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card hover-lift scale-in" style={{animationDelay: '0.3s'}}>
              <CardHeader>
                <CardTitle className="text-lg">CSV形式</CardTitle>
                <CardDescription>表計算ソフトで開ける形式</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleCopy("csv")}
                >
                  {copiedFormat === "csv" ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  コピー
                </Button>
                <Button
                  variant="default"
                  className="w-full gradient-bg hover-lift"
                  onClick={() => handleDownload("csv")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  ダウンロード
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>プレビュー</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {project.posts.map((post, idx) => (
                  <div
                    key={post.id}
                    className="p-4 rounded-lg bg-secondary/50 border border-border"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-primary">
                        {idx + 1}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {post.content.length}文字
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {post.content}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
