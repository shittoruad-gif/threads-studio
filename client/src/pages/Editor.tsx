import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getProjectById, saveProject } from "@/lib/storage";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { Post, Project } from "@shared/types";
import { ArrowLeft, GripVertical, Plus, Save, Trash2, Clock, Send } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { SchedulePostDialog } from "@/components/SchedulePostDialog";

export default function Editor() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const projectId = searchParams.get("project");

  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const initialLoadDone = useRef(false);

  // Auto-save to localStorage every 10 seconds when there are changes
  const autoSave = useCallback(() => {
    if (!project || !hasUnsavedChanges) return;
    const updatedProject: Project = {
      ...project,
      title,
      posts,
      updatedAt: Date.now(),
    };
    saveProject(updatedProject);
    setHasUnsavedChanges(false);
  }, [project, title, posts, hasUnsavedChanges]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    setHasUnsavedChanges(true);

    // Debounced auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(autoSave, 10000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [title, posts]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    // sessionStorageからプロジェクトを取得
    const storedProject = sessionStorage.getItem('currentProject');
    if (storedProject) {
      const proj = JSON.parse(storedProject) as Project;
      setProject(proj);
      setTitle(proj.title);
      setPosts(proj.posts);
      sessionStorage.removeItem('currentProject');
      // Also persist to localStorage immediately
      saveProject(proj);
      initialLoadDone.current = true;
    } else {
      // LocalStorageから既存プロジェクトを読み込み
      if (projectId) {
        const existingProject = getProjectById(projectId);
        if (existingProject) {
          setProject(existingProject);
          setTitle(existingProject.title);
          setPosts(existingProject.posts);
          initialLoadDone.current = true;
        } else {
          toast.error("プロジェクトが見つかりません");
          setLocation("/");
        }
      } else {
        toast.error("プロジェクトが見つかりません");
        setLocation("/");
      }
    }
  }, [location, setLocation, projectId]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(posts);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // orderを更新
    const updatedPosts = items.map((post, index) => ({
      ...post,
      order: index,
    }));

    setPosts(updatedPosts);
  };

  const handleUpdatePost = (id: string, content: string) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === id ? { ...post, content } : post))
    );
  };

  const handleDeletePost = (id: string) => {
    const post = posts.find((p) => p.id === id);
    if (post && post.content.trim()) {
      if (!confirm('このポストを削除しますか？内容は失われます。')) return;
    }
    setPosts((prev) => prev.filter((post) => post.id !== id));
  };

  const handleAddPost = () => {
    const newPost: Post = {
      id: nanoid(),
      content: "",
      order: posts.length,
    };
    setPosts((prev) => [...prev, newPost]);
  };

  const handleSave = () => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      title,
      posts,
      updatedAt: Date.now(),
    };

    saveProject(updatedProject);
    setHasUnsavedChanges(false);
    toast.success("プロジェクトを保存しました");
  };

  const getCharCount = (content: string) => content.length;
  const isOverLimit = (content: string) =>
    project ? getCharCount(content) > project.maxCharsPerPost : false;

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" style={{animationDelay: '0s'}} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/30 rounded-full blur-3xl float" style={{animationDelay: '2s'}} />
      </div>
      
      <div className="container py-8 relative z-10">
        <div className="flex items-center justify-between mb-6 scale-in">
          <Button variant="ghost" className="glass hover-lift" onClick={() => {
            if (hasUnsavedChanges) {
              if (!confirm('未保存の変更があります。保存せずに戻りますか？')) return;
            }
            setLocation("/");
          }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            テンプレート選択に戻る
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="glass hover-lift" onClick={() => {
              sessionStorage.setItem('exportProject', JSON.stringify({ ...project, title, posts }));
              setLocation(`/export?project=${projectId}`);
            }}>
              書き出し
            </Button>
            <Button 
              variant="outline" 
              className="glass hover-lift"
              onClick={() => {
                if (posts.length === 0) {
                  toast.error('投稿内容がありません');
                  return;
                }
                // 保存してから予約投稿
                handleSave();
                setScheduleDialogOpen(true);
              }}
            >
              <Clock className="w-4 h-4 mr-2" />
              予約投稿
            </Button>
            <Button className="gradient-bg hover-lift" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* エディタ部分 */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <Label htmlFor="title">プロジェクト名</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="プロジェクト名を入力"
                  className="text-lg font-semibold"
                />
              </CardHeader>
            </Card>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="posts">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-4"
                  >
                    {posts.map((post, index) => (
                      <Draggable key={post.id} draggableId={post.id} index={index}>
                        {(provided, snapshot) => (
                          <Card
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`glass-card hover-lift transition-all ${
                              snapshot.isDragging ? "shadow-2xl scale-105 glow" : ""
                            }`}
                          >
                            <CardHeader className="flex flex-row items-center gap-4 pb-3">
                              <div
                                {...provided.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing"
                              >
                                <GripVertical className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-muted-foreground">
                                    ポスト {index + 1}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-sm font-medium ${
                                        isOverLimit(post.content)
                                          ? "text-destructive"
                                          : "text-muted-foreground"
                                      }`}
                                    >
                                      {getCharCount(post.content)} / {project.maxCharsPerPost}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="ポストを削除"
                                      onClick={() => handleDeletePost(post.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <Textarea
                                value={post.content}
                                onChange={(e) =>
                                  handleUpdatePost(post.id, e.target.value)
                                }
                                rows={4}
                                placeholder="ポスト内容を入力"
                                className={
                                  isOverLimit(post.content) ? "border-destructive" : ""
                                }
                              />
                            </CardContent>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <Button
              variant="outline"
              className="w-full glass hover-lift"
              onClick={handleAddPost}
            >
              <Plus className="w-4 h-4 mr-2" />
              ポストを追加
            </Button>
          </div>

          {/* プレビュー部分 */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>プレビュー</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {posts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      ポストがありません
                    </p>
                  ) : (
                    posts.map((post, index) => (
                      <div
                        key={post.id}
                        className="p-4 rounded-lg bg-secondary/50 border border-border"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-primary">
                            {index + 1}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getCharCount(post.content)}文字
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {post.content || (
                            <span className="text-muted-foreground italic">
                              未入力
                            </span>
                          )}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* 予約投稿ダイアログ */}
      {project && (
        <SchedulePostDialog
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          projectId={project.id}
          postContent={posts.map((p, i) => `[${i + 1}/${posts.length}]\n${p.content}`).join('\n\n---\n\n')}
        />
      )}
    </div>
  );
}
