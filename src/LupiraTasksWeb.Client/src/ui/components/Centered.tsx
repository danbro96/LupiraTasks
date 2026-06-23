import type { ReactNode } from 'react';

/** Full-height centered message — used for loading, invalid-link, and error states. */
export function Centered({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="centered">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
