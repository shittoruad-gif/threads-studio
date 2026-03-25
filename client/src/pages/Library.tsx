import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteProject, getAllProjects, searchProjects, sortProjects } from "@/lib/storage";
import { Project } from "@shared/types";
import { ArrowLeft, FileText, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Library() {
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "updatedAt" | "title">("updatedAt");

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    let result = searchQuery ? searchProjects(searchQuery) : projects;
    result = sortProjects(result, sortBy);
    setFilteredProjects(result);
  }, [projects, searchQuery, sortBy]);

  const loadProjects = () => {
    const allProjects = getAllProjects();
    setProjects(allProjects);
  };

  const handleDelete = (id: string) => {
    if (confirm("このプロジェクトを削除しますか？")) {
      deleteProject(id);
      loadProjects();
      toast.success("プロジェクトを削除しました");
    }
  };

  const handleOpenProject = (project: Project) => {
    sessionStorage.setItem('currentProject', JSON.stringify(project));
    setLocation(`/editor?project=${project.id}`);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '1s'}} />
        <div className="absolute bottom-10 right-20 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '3s'}} />
      </div>
      
      <div className="container py-12 relative z-10">
        <div className="mb-6 scale-in">
          <Button variant="ghost" className="glass hover-lift" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            テンプレート選択に戻る
          </Button>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 scale-in">
            <h1 className="text-5xl font-bold mb-2">ライブラリ</h1>
            <p className="text-muted-foreground">保存したプロジェクトを管理</p>
          </div>

          <Card className="glass-card mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="プロジェクト名、タグ、内容で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updatedAt">更新日時順</SelectItem>
                    <SelectItem value="createdAt">作成日時順</SelectItem>
                    <SelectItem value="title">タイトル順</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {filteredProjects.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? "検索結果が見つかりませんでした"
                    : "保存されたプロジェクトがありません"}
                </p>
                <Button onClick={() => setLocation("/")}>
                  新しいプロジェクトを作成
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.map((project, index) => (
                <Card
                  key={project.id}
                  className="glass-card group hover-lift cursor-pointer scale-in"
                  style={{animationDelay: `${index * 0.05}s`}}
                  onClick={() => handleOpenProject(project)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-1">{project.title}</CardTitle>
                        <CardDescription>
                          {project.posts.length} ポスト
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(project.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {project.posts.length > 0 && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {project.posts[0].content}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                        <span>作成: {formatDate(project.createdAt)}</span>
                        <span>更新: {formatDate(project.updatedAt)}</span>
                      </div>
                      {project.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-2">
                          {project.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
