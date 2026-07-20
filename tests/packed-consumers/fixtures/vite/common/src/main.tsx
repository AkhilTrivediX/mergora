import "mergora-tokens/tokens.css";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Packed consumer root is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
