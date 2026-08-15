import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App as PortalApp } from "./App";
import { App as DemoApp } from "./pages/DemoApp";

const App = import.meta.env.MODE === "demo" ? DemoApp : PortalApp;

const container = document.getElementById("root");
if (!container) throw new Error("React root #root missing");

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
