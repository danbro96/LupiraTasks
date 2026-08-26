import type { ReactNode } from 'react';
import Box from '@mui/material/Box';

/** Full-height centered message — used for loading, invalid-link, and error states. */
export function Centered({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 1, p: 3 }}>
      <h2>{title}</h2>
      {children}
    </Box>
  );
}
