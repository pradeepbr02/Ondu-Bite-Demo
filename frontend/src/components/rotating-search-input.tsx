'use client';

import { useEffect, useState } from 'react';

const examples = ['Chakli', 'Poha', 'Filter coffee', 'Upma', 'Nippat'];

export function RotatingSearchInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [turn, setTurn] = useState(0);
  const empty = value === '';

  useEffect(() => {
    if (!empty) return;
    const timer = window.setInterval(() => setTurn((current) => current + 1), 2000);
    return () => window.clearInterval(timer);
  }, [empty]);

  const hint = `Try “${examples[turn % examples.length]}”…`;

  return (
    <span className="search-input-wrap">
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={hint}
      />
      {empty && (
        <span key={turn} className="search-hint" aria-hidden="true">
          {turn > 0 && (
            <span className="search-hint-out">Try “{examples[(turn - 1) % examples.length]}”…</span>
          )}
          <span className={turn > 0 ? 'search-hint-in' : undefined}>{hint}</span>
        </span>
      )}
    </span>
  );
}
