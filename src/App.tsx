import { Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Lupira Tasks</h1>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
