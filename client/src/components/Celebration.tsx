import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

// ============================================================
// Celebration milestones configuration
// ============================================================

type MilestoneKey =
  | "first-generation"
  | "first-post"
  | "10-posts"
  | "first-follower";

interface Milestone {
  key: MilestoneKey;
  storageKey: string;
  message: string;
}

const MILESTONES: Record<MilestoneKey, Milestone> = {
  "first-generation": {
    key: "first-generation",
    storageKey: "celebration-first-generation",
    message: "おめでとう！初めての投稿が完成しました 🎉",
  },
  "first-post": {
    key: "first-post",
    storageKey: "celebration-first-post",
    message: "Threadsへの初投稿が完了しました！ 🎊",
  },
  "10-posts": {
    key: "10-posts",
    storageKey: "celebration-10-posts",
    message: "10投稿達成！集客効果が出始める頃です 💪",
  },
  "first-follower": {
    key: "first-follower",
    storageKey: "celebration-first-follower",
    message: "フォロワーが増えています！ 📈",
  },
};

// ============================================================
// Confetti CSS animation component (no heavy library)
// ============================================================

function ConfettiOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  // Generate confetti pieces with random properties
  const pieces = Array.from({ length: 40 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const duration = 1.8 + Math.random() * 1.2;
    const size = 6 + Math.random() * 6;
    const colors = [
      "#f59e0b", // amber
      "#10b981", // emerald
      "#f97316", // orange
      "#ec4899", // pink
      "#8b5cf6", // violet
      "#06b6d4", // cyan
      "#ef4444", // red
    ];
    const color = colors[i % colors.length];
    const rotation = Math.random() * 360;
    const xDrift = (Math.random() - 0.5) * 60;

    return (
      <span
        key={i}
        className="celebration-confetti-piece"
        style={
          {
            "--left": `${left}%`,
            "--delay": `${delay}s`,
            "--duration": `${duration}s`,
            "--size": `${size}px`,
            "--color": color,
            "--rotation": `${rotation}deg`,
            "--x-drift": `${xDrift}px`,
          } as React.CSSProperties
        }
      />
    );
  });

  return (
    <div className="celebration-confetti-container" aria-hidden="true">
      {pieces}
    </div>
  );
}

// ============================================================
// Exported trigger function (imperative)
// ============================================================

let _showCelebration: ((key: MilestoneKey) => void) | null = null;

/**
 * Trigger a celebration by milestone key.
 * Only fires once per milestone (tracked in localStorage).
 */
export function triggerCelebration(key: MilestoneKey): void {
  const milestone = MILESTONES[key];
  if (!milestone) return;

  // Only show once per milestone
  const alreadyShown = localStorage.getItem(milestone.storageKey);
  if (alreadyShown) return;

  localStorage.setItem(milestone.storageKey, "true");

  // Show toast with warm styling
  toast.success(milestone.message, {
    duration: 5000,
    style: {
      background: "#fffbeb",
      border: "1px solid #fbbf24",
      color: "#92400e",
    },
  });

  // Trigger confetti overlay
  _showCelebration?.(key);
}

/**
 * Check a numeric milestone (10 posts, etc) and trigger if threshold met.
 */
export function checkPostCountMilestone(count: number): void {
  if (count >= 10) {
    triggerCelebration("10-posts");
  }
}

// ============================================================
// CelebrationProvider - mount once at app root level
// ============================================================

export function CelebrationProvider() {
  const [activeKey, setActiveKey] = useState<MilestoneKey | null>(null);

  useEffect(() => {
    _showCelebration = (key: MilestoneKey) => {
      setActiveKey(key);
    };
    return () => {
      _showCelebration = null;
    };
  }, []);

  const handleDone = useCallback(() => {
    setActiveKey(null);
  }, []);

  if (!activeKey) return null;

  return <ConfettiOverlay onDone={handleDone} />;
}

// ============================================================
// Global CSS for confetti (injected once)
// ============================================================

const CONFETTI_STYLES = `
.celebration-confetti-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}

.celebration-confetti-piece {
  position: absolute;
  top: -10px;
  left: var(--left);
  width: var(--size);
  height: var(--size);
  background: var(--color);
  border-radius: 2px;
  opacity: 0;
  animation: confetti-fall var(--duration) ease-out var(--delay) forwards;
  transform: rotate(var(--rotation));
}

@keyframes confetti-fall {
  0% {
    opacity: 1;
    transform: translateY(0) translateX(0) rotate(var(--rotation)) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(100vh) translateX(var(--x-drift)) rotate(calc(var(--rotation) + 720deg)) scale(0.5);
  }
}
`;

// Inject styles once
if (typeof document !== "undefined") {
  const existing = document.getElementById("celebration-styles");
  if (!existing) {
    const style = document.createElement("style");
    style.id = "celebration-styles";
    style.textContent = CONFETTI_STYLES;
    document.head.appendChild(style);
  }
}
