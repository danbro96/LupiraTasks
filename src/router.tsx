import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import HomePage from "./pages/HomePage";
import ShareViewPage from "./pages/ShareViewPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      // The API mints share links as `{base}/s/{token}`.
      { path: "s/:token", element: <ShareViewPage /> },
      { path: "*", element: <HomePage /> },
    ],
  },
]);
