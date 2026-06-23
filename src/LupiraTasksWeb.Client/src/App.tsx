import { Outlet } from "react-router-dom";

/** Thin layout shell — a centered phone-width column. Each page renders its own chrome
 *  (the shared list owns its color stripe + header). */
export default function App() {
  return (
    <div className="app">
      <Outlet />
    </div>
  );
}
