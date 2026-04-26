import { useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Emoji picker tuned for Threads marketing posts.
 *
 * Categories are deliberately curated rather than exhaustive — these are
 * the emojis that actually show up in successful Threads posts (per the
 * 19-video know-how analysis). Pickers with thousands of options
 * overwhelm users; ~80 hand-picked ones keep them in the "natural and
 * not too AI-looking" zone.
 */

interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  emojis: string[];
}

const CATEGORIES: EmojiCategory[] = [
  {
    id: 'common',
    label: 'よく使う',
    icon: '⭐',
    emojis: ['💡', '✨', '📍', '🔥', '🎯', '💪', '🙌', '👇', '✅', '❌',
             '👀', '💭', '❓', '⚠️', '🔑', '📌', '⏰', '🆕', '💯', '⭐'],
  },
  {
    id: 'emotion',
    label: '感情',
    icon: '😊',
    emojis: ['😊', '😅', '😭', '🤔', '😱', '🥺', '😎', '🥰', '😢', '😄',
             '🙏', '🥲', '😌', '🫶', '😍', '🤗', '😉', '☺️', '🤩', '😆'],
  },
  {
    id: 'business',
    label: 'ビジネス',
    icon: '📊',
    emojis: ['📊', '📈', '📉', '🏆', '🎁', '💼', '📅', '⭐', '💎', '📝',
             '🎬', '📞', '✉️', '🛒', '🏠', '🚗', '🏪', '👔', '🤝', '👏'],
  },
  {
    id: 'health',
    label: '体・健康',
    icon: '💆',
    emojis: ['💆‍♀️', '💆', '🩺', '💉', '🦴', '🧘‍♀️', '🧘', '🏋️‍♀️', '🏋️', '🤸',
             '🦵', '🦶', '👁️', '🦷', '💊', '🚶‍♀️', '🚶', '🏃‍♀️', '🏃', '😴'],
  },
  {
    id: 'food',
    label: '飲食',
    icon: '🍽️',
    emojis: ['🍽️', '🥗', '🍰', '☕', '🍵', '🍣', '🍜', '🍱', '🥢', '🍻',
             '🍕', '🍔', '🍟', '🍙', '🍚', '🍞', '🍩', '🍫', '🍷', '🍶'],
  },
  {
    id: 'cv',
    label: 'お金・CTA',
    icon: '💰',
    emojis: ['💰', '💴', '💸', '🎉', '🆓', '📢', '🚀', '🔔', '🎊', '✨',
             '💝', '🎀', '🏷️', '💵', '💳', '📦', '🎈', '🌟', '☝️', '👉'],
  },
  {
    id: 'arrows',
    label: '矢印・記号',
    icon: '➡️',
    emojis: ['👇', '👆', '👈', '👉', '⬇️', '⬆️', '⬅️', '➡️', '↘️', '↙️',
             '✔️', '⭕', '❌', '⚠️', '❗', '❓', '💬', '🔄', '🔁', '〰️'],
  },
];

interface EmojiPickerProps {
  /** Called with the chosen emoji string. */
  onEmojiSelect: (emoji: string) => void;
  /** Optional trigger element. Defaults to a small "smile" icon button. */
  triggerLabel?: string;
  /** Extra class for the trigger button. */
  className?: string;
}

export default function EmojiPicker({
  onEmojiSelect,
  triggerLabel,
  className = '',
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>('common');

  const handlePick = (emoji: string) => {
    onEmojiSelect(emoji);
    // Keep open so the user can insert several emojis in a row without
    // re-opening the popover each time.
  };

  const current = CATEGORIES.find(c => c.id === activeCat) ?? CATEGORIES[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`gap-1 text-muted-foreground hover:text-foreground ${className}`}
          title="絵文字を挿入"
          aria-label="絵文字を挿入"
        >
          <Smile className="w-4 h-4" />
          {triggerLabel && <span className="text-xs">{triggerLabel}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 p-0"
      >
        {/* Category tabs */}
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border overflow-x-auto">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCat(cat.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded text-xs flex-shrink-0 transition-colors ${
                activeCat === cat.id
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
              title={cat.label}
            >
              <span className="text-lg leading-none">{cat.icon}</span>
              <span className="text-[10px] leading-none">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="p-2 grid grid-cols-10 gap-1">
          {current.emojis.map((emoji, i) => (
            <button
              key={`${current.id}-${i}`}
              type="button"
              onClick={() => handlePick(emoji)}
              className="aspect-square flex items-center justify-center text-xl rounded hover:bg-muted transition-colors"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
          💡 Threadsでは1投稿に絵文字3〜4個までが自然です
        </div>
      </PopoverContent>
    </Popover>
  );
}
