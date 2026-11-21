'use client';
import { useEffect, useRef, useState } from 'react';

export function useNearViewport<T extends HTMLElement>(priority = false) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(priority);
  useEffect(() => {
    if (visible) return;
    if (priority || !('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, priority]);
  return { ref, visible };
}
