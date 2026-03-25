import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { MessageCircle, X, Minimize2, Maximize2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: messages = [], isLoading: messagesLoading } = trpc.aiChat.getMessages.useQuery(
    { conversationId: conversationId! },
    { enabled: conversationId !== null }
  );

  const sendMessageMutation = trpc.aiChat.sendMessage.useMutation({
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      utils.aiChat.getMessages.invalidate({ conversationId: data.conversationId });
      setMessage("");
    },
    onError: () => {
      toast.error("メッセージの送信に失敗しました");
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate({
      conversationId: conversationId || undefined,
      message: message.trim(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        size="lg"
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg z-50"
      >
        <MessageCircle className="w-6 h-6" />
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <Card className="fixed bottom-6 right-6 w-80 shadow-lg z-50">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <span className="font-semibold">AIアシスタント</span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMinimized(false)}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <span className="font-semibold">AIアシスタント</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 && !messagesLoading && (
          <div className="text-center text-muted-foreground py-8">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">
              こんにちは！Threads投稿の作成や
              <br />
              ツールの使い方についてお手伝いします。
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.role === "assistant" ? (
                  <Streamdown>{msg.content}</Streamdown>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {sendMessageMutation.isPending && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            disabled={sendMessageMutation.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Enter で送信、Shift + Enter で改行
        </p>
      </div>
    </Card>
  );
}
