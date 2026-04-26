import { forwardRef, useRef, useImperativeHandle } from 'react';
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
const TextareaWithEmoji = forwardRef<HTMLTextAreaElement, TextareaWithEmojiProps>(
  function TextareaWithEmoji({ value, onChange, rows, className, placeholder }, ref) {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => internalRef.current as HTMLTextAreaElement);

    const insertEmoji = (emoji: string) => {
      const ta = internalRef.current;
      if (!ta) {
        onChange(value + emoji);
        return;
      }
      // Use the ref's current selection. We capture before emoji insertion
      // so React's controlled-input round-trip doesn't lose the position.
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const next = value.slice(0, start) + emoji + value.slice(end);
      onChange(next);
      // Restore caret placement just after the inserted emoji on next tick.
      requestAnimationFrame(() => {
        if (!internalRef.current) return;
        const caret = start + emoji.length;
        internalRef.current.focus();
        internalRef.current.setSelectionRange(caret, caret);
      });
    };

    return (
      <div className="relative">
        <Textarea
          ref={internalRef}
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
  },
);

export default TextareaWithEmoji;
