import { createRoot } from "react-dom/client";

import { BenchmarkDesktopApp } from "@benchmark/app-shell/src/renderer";

createRoot(document.getElementById("root")!).render(
  <BenchmarkDesktopApp host={window.benchmarkHost} />
);
