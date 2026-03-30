import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { nanoid } from 'nanoid';
import { Send, Sparkles, ChevronRight, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { industryTemplates, INDUSTRY_CATEGORIES } from '@/data/industry-templates';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
  quickReplies?: string[];
}

interface FormData {
  title: string;
  businessType: string;
  area: string;
  target: string;
  mainProblem: string;
  strength: string;
  proof: string;
  ctaLink: string;
}

type StepKey = 'businessType' | 'area' | 'target' | 'mainProblem' | 'strength';

interface Step {
  key: StepKey;
  question: string;
  quickReplies: (form: FormData) => string[];
}

// ─── Steps ───────────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    key: 'businessType',
    question: 'はじめまして！\nまずは、どんな業種のお店（ビジネス）ですか？',
    quickReplies: () => {
      // Pick a selection of unique business types from templates
      const seen = new Set<string>();
      const suggestions: string[] = [];
      for (const t of industryTemplates) {
        if (!seen.has(t.businessType) && suggestions.length < 8) {
          seen.add(t.businessType);
          suggestions.push(t.businessType);
        }
      }
      return suggestions;
    },
  },
  {
    key: 'area',
    question: 'お店はどこにありますか？（地域・エリア）',
    quickReplies: (form) => {
      const match = industryTemplates.find(
        (t) => t.businessType === form.businessType
      );
      if (match) return [match.area];
      return ['東京都渋谷区', '大阪市北区', '名古屋市中区', '福岡市中央区'];
    },
  },
  {
    key: 'target',
    question: 'ターゲットのお客様はどんな方ですか？',
    quickReplies: (form) => {
      const match = industryTemplates.find(
        (t) => t.businessType === form.businessType
      );
      if (match) return [match.target];
      return [];
    },
  },
  {
    key: 'mainProblem',
    question: 'お客様のよくある悩みは何ですか？',
    quickReplies: (form) => {
      const match = industryTemplates.find(
        (t) => t.businessType === form.businessType
      );
      if (match) return [match.mainProblem];
      return [];
    },
  },
  {
    key: 'strength',
    question: 'お店の強み・特徴を教えてください！',
    quickReplies: (form) => {
      const match = industryTemplates.find(
        (t) => t.businessType === form.businessType
      );
      if (match) return [match.strength];
      return [];
    },
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface ChatProjectSetupProps {
  /** If the parent already has form data (e.g. user toggled from form mode), seed it here. */
  initialData?: Partial<FormData>;
  /** Called whenever chat data updates, so the parent can preserve it on mode toggle. */
  onDataChange?: (data: FormData) => void;
}

export default function ChatProjectSetup({
  initialData,
  onDataChange,
}: ChatProjectSetupProps) {
  const [, setLocation] = useLocation();
  const [projectId] = useState(nanoid());

  const [form, setForm] = useState<FormData>({
    title: '',
    businessType: '',
    area: '',
    target: '',
    mainProblem: '',
    strength: '',
    proof: '',
    ctaLink: '',
    ...initialData,
  });

  // Determine the starting step based on initialData
  const getInitialStep = useCallback(() => {
    if (!initialData) return 0;
    for (let i = 0; i < STEPS.length; i++) {
      if (!initialData[STEPS[i].key]) return i;
    }
    return STEPS.length; // all filled
  }, [initialData]);

  const [currentStep, setCurrentStep] = useState(getInitialStep);
  const [inputValue, setInputValue] = useState('');
  const [showSummary, setShowSummary] = useState(() => getInitialStep() >= STEPS.length);
  const [isTyping, setIsTyping] = useState(false);

  // Build initial messages from any pre-filled data
  const buildInitialMessages = useCallback((): ChatMessage[] => {
    const msgs: ChatMessage[] = [];
    const step0 = getInitialStep();

    for (let i = 0; i < step0 && i < STEPS.length; i++) {
      msgs.push({
        id: `ai-init-${i}`,
        role: 'ai',
        text: STEPS[i].question,
      });
      const val = initialData?.[STEPS[i].key] || '';
      if (val) {
        msgs.push({
          id: `user-init-${i}`,
          role: 'user',
          text: val,
        });
      }
    }

    // Add the current question if not done
    if (step0 < STEPS.length) {
      msgs.push({
        id: `ai-init-${step0}`,
        role: 'ai',
        text: STEPS[step0].question,
        quickReplies: STEPS[step0].quickReplies(form),
      });
    }

    // If no messages yet, start the greeting
    if (msgs.length === 0) {
      msgs.push({
        id: 'ai-0',
        role: 'ai',
        text: STEPS[0].question,
        quickReplies: STEPS[0].quickReplies(form),
      });
    }

    return msgs;
  }, [initialData, getInitialStep, form]);

  const [messages, setMessages] = useState<ChatMessage[]>(buildInitialMessages);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  // Notify parent of data changes
  useEffect(() => {
    onDataChange?.(form);
  }, [form, onDataChange]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      // Small delay to let animation start
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, showSummary]);

  // Focus input when step changes
  useEffect(() => {
    if (!showSummary) {
      inputRef.current?.focus();
    }
  }, [currentStep, showSummary]);

  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      toast.success('プロジェクトを作成しました');
      setLocation(`/ai-generate?project=${projectId}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleAnswer = useCallback(
    (answer: string) => {
      if (!answer.trim() || currentStep >= STEPS.length) return;

      const step = STEPS[currentStep];
      const newForm = { ...form, [step.key]: answer.trim() };
      setForm(newForm);

      // Add user message (remove quickReplies from the last AI message)
      setMessages((prev) => {
        const updated = prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, quickReplies: undefined } : m
        );
        return [
          ...updated,
          {
            id: `user-${currentStep}`,
            role: 'user' as const,
            text: answer.trim(),
          },
        ];
      });

      setInputValue('');

      const nextStep = currentStep + 1;

      if (nextStep >= STEPS.length) {
        // All done - show typing indicator then summary
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-done`,
              role: 'ai',
              text: 'ありがとうございます！入力内容をまとめました。',
            },
          ]);
          setCurrentStep(nextStep);
          setShowSummary(true);
        }, 800);
      } else {
        // Next question with typing indicator
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${nextStep}`,
              role: 'ai',
              text: STEPS[nextStep].question,
              quickReplies: STEPS[nextStep].quickReplies(newForm),
            },
          ]);
          setCurrentStep(nextStep);
        }, 600);
      }
    },
    [currentStep, form]
  );

  const handleSubmit = async () => {
    if (
      !form.businessType ||
      !form.area ||
      !form.target ||
      !form.mainProblem ||
      !form.strength
    ) {
      toast.error('必須項目を入力してください');
      return;
    }
    await createProjectMutation.mutateAsync({
      id: projectId,
      title: form.title || `${form.businessType} Threads集客`,
      businessType: form.businessType,
      area: form.area,
      target: form.target,
      mainProblem: form.mainProblem,
      strength: form.strength,
      proof: form.proof || undefined,
      ctaLink: form.ctaLink || undefined,
    });
  };

  const handleReset = () => {
    setForm({
      title: '',
      businessType: '',
      area: '',
      target: '',
      mainProblem: '',
      strength: '',
      proof: '',
      ctaLink: '',
    });
    setCurrentStep(0);
    setShowSummary(false);
    setInputValue('');
    setMessages([
      {
        id: 'ai-0-reset',
        role: 'ai',
        text: STEPS[0].question,
        quickReplies: STEPS[0].quickReplies({
          title: '',
          businessType: '',
          area: '',
          target: '',
          mainProblem: '',
          strength: '',
          proof: '',
          ctaLink: '',
        }),
      },
    ]);
  };

  return (
    <div className="flex flex-col h-[600px] sm:h-[640px] bg-gradient-to-b from-orange-50/50 to-background rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white/80 backdrop-blur-sm">
        <div className="bg-orange-100 p-2 rounded-full">
          <Sparkles className="h-4 w-4 text-orange-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Threads Studio</p>
          <p className="text-xs text-muted-foreground">
            {showSummary
              ? '入力完了'
              : `質問 ${Math.min(currentStep + 1, STEPS.length)} / ${STEPS.length}`}
          </p>
        </div>
        {showSummary && (
          <button
            onClick={handleReset}
            className="ml-auto text-xs text-muted-foreground/60 hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            やり直す
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500 ease-out"
          style={{
            width: `${((showSummary ? STEPS.length : currentStep) / STEPS.length) * 100}%`,
          }}
        />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={msg.id}
            className={cn(
              'flex animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
            style={{ animationDelay: `${idx === messages.length - 1 ? 0 : 0}ms` }}
          >
            {msg.role === 'ai' && (
              <div className="flex-shrink-0 mr-2 mt-1">
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                </div>
              </div>
            )}
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-white text-foreground shadow-sm border border-border/50 rounded-bl-md'
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Quick replies for the latest AI message */}
        {!showSummary && !isTyping && messages.length > 0 && (() => {
          const lastAI = [...messages].reverse().find((m) => m.role === 'ai');
          if (!lastAI?.quickReplies?.length) return null;
          return (
            <div className="flex flex-wrap gap-2 pl-9 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              {lastAI.quickReplies.map((reply, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(reply)}
                  className="text-left text-xs sm:text-sm bg-white border border-orange-200 text-orange-700 rounded-full px-3 py-1.5 hover:bg-orange-50 hover:border-orange-300 transition-colors shadow-sm active:scale-95"
                >
                  {reply}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-start gap-2 animate-in fade-in-0 duration-200">
            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <div className="bg-white shadow-sm border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Summary card */}
        {showSummary && (
          <div className="pl-9 animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
            <div className="bg-white rounded-xl border border-border/50 shadow-sm overflow-hidden">
              <div className="p-4 space-y-3">
                <SummaryRow label="業種" value={form.businessType} />
                <SummaryRow label="地域" value={form.area} />
                <SummaryRow label="ターゲット" value={form.target} />
                <SummaryRow label="お客様の悩み" value={form.mainProblem} />
                <SummaryRow label="お店の強み" value={form.strength} />
              </div>
              <div className="border-t px-4 py-3">
                <Button
                  onClick={handleSubmit}
                  disabled={createProjectMutation.isPending}
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
                  size="lg"
                >
                  {createProjectMutation.isPending ? (
                    <span className="animate-spin mr-2">...</span>
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  プロジェクトを作成
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      {!showSummary && (
        <div className="border-t bg-white px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !composingRef.current && !(e.nativeEvent as any).isComposing) {
                  e.preventDefault();
                  handleAnswer(inputValue);
                }
              }}
              placeholder="入力してください..."
              className="flex-1 bg-muted/50 border border-border rounded-full px-4 py-2.5 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-all placeholder:text-muted-foreground/60"
              disabled={isTyping}
            />
            <button
              onClick={() => handleAnswer(inputValue)}
              disabled={!inputValue.trim() || isTyping}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 disabled:opacity-40 disabled:hover:bg-orange-500 transition-colors active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-shrink-0 mt-0.5">
        <Check className="w-3.5 h-3.5 text-green-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}
