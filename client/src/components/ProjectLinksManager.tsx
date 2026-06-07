import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Star, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  type ProjectLink,
  type ProjectLinkType,
  LINK_TYPES,
  LINK_TYPES_LIST,
  parseProjectLinks,
  normaliseDefaults,
} from '@shared/projectLinks';

interface ProjectLinksManagerProps {
  projectId: string;
  /** Raw `links` JSON from the project. */
  initialLinksJson: string | null | undefined;
  /** Optional callback fired after a successful save. */
  onSaved?: (links: ProjectLink[]) => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * UI for registering & reusing URLs (LINE / Web reservation / HP / etc.) on
 * a project. Each link has a type-coded emoji label so the user can tell
 * at a glance which URL is which when picking from a dropdown elsewhere.
 *
 * Save is explicit — the user clicks "保存" after editing. Until then the
 * draft lives in local state and the user can cancel via the reset button.
 */
export default function ProjectLinksManager({
  projectId,
  initialLinksJson,
  onSaved,
}: ProjectLinksManagerProps) {
  const [links, setLinks] = useState<ProjectLink[]>(() => parseProjectLinks(initialLinksJson));
  const [dirty, setDirty] = useState(false);

  // Re-hydrate when the underlying project data changes (e.g. after save +
  // refetch) so external edits don't get clobbered by stale local state.
  useEffect(() => {
    setLinks(parseProjectLinks(initialLinksJson));
    setDirty(false);
  }, [initialLinksJson]);

  const setLinksMutation = trpc.project.setLinks.useMutation({
    onSuccess: () => {
      toast.success('URLを保存しました');
      setDirty(false);
      onSaved?.(links);
    },
    onError: (err) => {
      toast.error(`保存できませんでした: ${err.message}`);
    },
  });

  const updateLink = (id: string, patch: Partial<ProjectLink>) => {
    setLinks(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const addLink = (type: ProjectLinkType) => {
    const cfg = LINK_TYPES[type];
    setLinks(prev => normaliseDefaults([
      ...prev,
      {
        id: genId(),
        type,
        label: cfg.name,
        url: '',
        // First link of this type → mark default automatically
        isDefault: !prev.some(l => l.type === type),
      },
    ]));
    setDirty(true);
  };

  const removeLink = (id: string) => {
    setLinks(prev => prev.filter(l => l.id !== id));
    setDirty(true);
  };

  const setDefault = (id: string) => {
    setLinks(prev => {
      const target = prev.find(l => l.id === id);
      if (!target) return prev;
      return normaliseDefaults(
        prev.map(l => ({
          ...l,
          // Only one default per type; clear others of the same type
          isDefault: l.id === id ? true : (l.type === target.type ? false : l.isDefault),
        })),
      );
    });
    setDirty(true);
  };

  const handleSave = () => {
    // Drop any links that are missing a URL — they're effectively empty rows
    const sanitized = links.filter(l => l.url.trim().length > 0);
    setLinksMutation.mutate({ projectId, links: sanitized });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LinkIcon className="w-4 h-4 text-emerald-600" />
          誘導用URLの登録
        </CardTitle>
        <CardDescription>
          LINE公式・Web予約・公式HPなどのURLを1度登録しておくと、
          固定投稿や自動投稿のCTAで自動的に最適なURLが使われます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing links */}
        {links.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            まだURLが登録されていません。下のボタンから追加してください。
          </div>
        ) : (
          <div className="space-y-3">
            {links.map(link => {
              const cfg = LINK_TYPES[link.type];
              return (
                <div
                  key={link.id}
                  className="rounded-lg border border-border bg-background/50 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Type badge */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs font-medium min-w-0">
                      <span className="text-base leading-none">{cfg.emoji}</span>
                      <span className="truncate">{cfg.name}</span>
                    </div>

                    {/* Default toggle */}
                    {link.isDefault ? (
                      <span
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                        title="この種別の既定URLとして使われます"
                      >
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        既定
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDefault(link.id)}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                        title="この種別の既定URLにする"
                      >
                        既定にする
                      </button>
                    )}

                    <div className="flex-1" />

                    {link.url && /^https?:\/\//.test(link.url) && (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        開く
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLink(link.id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input
                      value={link.label}
                      onChange={e => updateLink(link.id, { label: e.target.value })}
                      placeholder="表示名（例: LINE登録）"
                      maxLength={40}
                      className="sm:col-span-1"
                    />
                    <Input
                      value={link.url}
                      onChange={e => updateLink(link.id, { url: e.target.value })}
                      placeholder={cfg.hint}
                      type="url"
                      className="sm:col-span-2"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add link buttons */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">URLを追加</p>
          <div className="flex flex-wrap gap-2">
            {LINK_TYPES_LIST.map(cfg => (
              <Button
                key={cfg.type}
                variant="outline"
                size="sm"
                onClick={() => addLink(cfg.type)}
                className="gap-1"
              >
                <Plus className="w-3 h-3" />
                <span className="text-base leading-none">{cfg.emoji}</span>
                {cfg.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Save / status row */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {dirty ? '未保存の変更があります' : '保存済み'}
          </p>
          <Button
            onClick={handleSave}
            disabled={!dirty || setLinksMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {setLinksMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
