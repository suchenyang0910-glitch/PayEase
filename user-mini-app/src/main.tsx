import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Do not let a stale ignored `App.js` shadow the authored TSX module.
import { App } from "./App.tsx";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
