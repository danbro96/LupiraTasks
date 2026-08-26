import { Outlet } from "react-router-dom";
import Box from '@mui/material/Box';

/** Thin layout shell — a centered phone-width column. Each page renders its own chrome
 *  (the shared list owns its color stripe + header). */
export default function App() {
  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Outlet />
    </Box>
  );
}
