import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { 
  Search, 
  Heart, 
  TrendingUp, 
  Eye, 
  X,
  Crown,
  Sparkles,
  Users,
  Utensils,
  Dumbbell,
  Scissors,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const CATEGORIES = [
  { id: "all", name: "すべて", icon: <Sparkles className="w-4 h-4" /> },
  { id: "clinic", name: "整体院・接骨院", icon: <Users className="w-4 h-4" /> },
  { id: "beauty", name: "美容サロン", icon: <Scissors className="w-4 h-4" /> },
  { id: "restaurant", name: "飲食店・カフェ", icon: <Utensils className="w-4 h-4" /> },
  { id: "gym", name: "ジム・フィットネス", icon: <Dumbbell className="w-4 h-4" /> },
  { id: "nail", name: "ネイルサロン", icon: <Sparkles className="w-4 h-4" /> },
  { id: "general", name: "汎用", icon: <Calendar className="w-4 h-4" /> },
];

export default function TemplateLibrary() {
  const { isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);

  const { data: allTemplates, isLoading } = trpc.templates.getAll.useQuery();
  const { data: favorites } = trpc.templates.getFavorites.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const addFavoriteMutation = trpc.templates.addFavorite.useMutation({
    onSuccess: () => {
      toast.success("お気に入りに追加しました");
    },
  });

  const removeFavoriteMutation = trpc.templates.removeFavorite.useMutation({
    onSuccess: () => {
      toast.success("お気に入りから削除しました");
    },
  });

  const incrementUsageMutation = trpc.templates.incrementUsage.useMutation();

  // Filter templates
  const filteredTemplates = allTemplates?.filter((template) => {
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    const matchesSearch = 
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleToggleFavorite = (templateId: number) => {
    if (!isAuthenticated) {
      toast.error("お気に入り機能を使用するにはログインが必要です");
      return;
    }

    const isFavorited = favorites?.some((fav) => fav.id === templateId);
    if (isFavorited) {
      removeFavoriteMutation.mutate({ templateId });
    } else {
      addFavoriteMutation.mutate({ templateId });
    }
  };

  const handlePreview = (template: any) => {
    setPreviewTemplate(template);
    if (isAuthenticated) {
      incrementUsageMutation.mutate({ templateId: template.id });
    }
  };

  const handleUseTemplate = (template: any) => {
    // TODO: Navigate to editor with template
    toast.success("テンプレートを選択しました");
    setPreviewTemplate(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">テンプレートライブラリ</h1>
          <p className="text-muted-foreground">業種別のテンプレートから選んで、すぐに投稿作成を開始</p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              type="text"
              placeholder="テンプレートを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 glass-card"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              onClick={() => setSelectedCategory(category.id)}
              className={selectedCategory === category.id ? "neon-border" : ""}
            >
              {category.icon}
              <span className="ml-2">{category.name}</span>
            </Button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates?.map((template) => {
            const isFavorited = favorites?.some((fav) => fav.id === template.id);
            
            return (
              <Card key={template.id} className="glass-card p-6 hover-lift relative">
                {/* Favorite Button */}
                <button
                  onClick={() => handleToggleFavorite(template.id)}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Heart className={`w-5 h-5 ${isFavorited ? "fill-red-400 text-red-400" : ""}`} />
                </button>

                {/* Badges */}
                <div className="flex gap-2 mb-3">
                  {template.isPopular && (
                    <Badge className="neon-border">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      人気
                    </Badge>
                  )}
                  {template.isPremium && (
                    <Badge variant="secondary">
                      <Crown className="w-3 h-3 mr-1" />
                      プレミアム
                    </Badge>
                  )}
                </div>

                {/* Template Info */}
                <h3 className="text-xl font-bold text-foreground mb-2">{template.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
                
                {/* Preview Text */}
                {template.previewText && (
                  <p className="text-xs text-muted-foreground mb-4 italic">
                    "{template.previewText}"
                  </p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {template.usageCount}回使用
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(template)}
                    className="flex-1"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    プレビュー
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleUseTemplate(template)}
                    className="flex-1 neon-border"
                  >
                    使用する
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredTemplates?.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">該当するテンプレートが見つかりませんでした</p>
            <Button variant="outline" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}>
              フィルターをクリア
            </Button>
          </div>
        )}

        {/* Preview Modal */}
        {previewTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setPreviewTemplate(null)}
            />
            <Card className="relative z-10 glass-card p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">{previewTemplate.title}</h2>
                    <p className="text-muted-foreground">{previewTemplate.description}</p>
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  {previewTemplate.isPopular && (
                    <Badge className="neon-border">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      人気
                    </Badge>
                  )}
                  {previewTemplate.isPremium && (
                    <Badge variant="secondary">
                      <Crown className="w-3 h-3 mr-1" />
                      プレミアム
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-2">テンプレート内容</h3>
                <div className="glass-card p-4 rounded-lg">
                  <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                    {previewTemplate.content}
                  </pre>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPreviewTemplate(null)}
                  className="flex-1"
                >
                  閉じる
                </Button>
                <Button
                  onClick={() => handleUseTemplate(previewTemplate)}
                  className="flex-1 neon-border"
                >
                  このテンプレートを使用
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
