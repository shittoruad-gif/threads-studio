import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import EmojiPicker from '@/components/EmojiPicker';

interface TextareaWithEmojiProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
}

/**
 * Textarea with a small floating emoji-picker button anchored at the
 * bottom-right corner. When the user picks an emoji, it's inserted at the
 * current caret position (or replaces the current selection) so multi-step
 * edits feel natural — same UX as Slack / Threads native composers.
 *
 * Falls back to appending at the end if the textarea isn't focused yet.
 */
export default function TextareaWithEmoji({
  value,
  onChange,
  rows,
  className,
  placeholder,
}: TextareaWithEmojiProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const insertEmoji = (emoji: string) => {
    const ta = taRef.current;
    if (!ta) {
      onChange(value + emoji);
      return;
    }
    // Capture caret position before the controlled-input round-trip
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      const caret = start + emoji.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`pb-9 ${className ?? ''}`}
      />
      <div className="absolute right-2 bottom-1.5">
        <EmojiPicker onEmojiSelect={insertEmoji} />
      </div>
    </div>
  );
}
