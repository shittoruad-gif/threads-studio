import { useEffect, useState } from 'react';

interface UseCountUpOptions {
  end: number;
  duration?: number;
  start?: number;
  isVisible: boolean;
}

export function useCountUp({ end, duration = 2000, start = 0, isVisible }: UseCountUpOptions) {
  const [count, setCount] = useState(start);

  useEffect(() => {
    if (!isVisible) return;

    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);

      // Easing function (easeOutExpo)
      const easeOut = percentage === 1 ? 1 : 1 - Math.pow(2, -10 * percentage);
      const currentCount = Math.floor(start + (end - start) * easeOut);

      setCount(currentCount);

      if (percentage < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [end, duration, start, isVisible]);

  return count;
}
