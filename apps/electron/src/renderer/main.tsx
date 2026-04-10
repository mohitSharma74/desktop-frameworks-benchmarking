import { createRoot } from "react-dom/client";

import { BenchmarkDesktopApp } from "@benchmark/app-shell/renderer";

window.addEventListener("error", (event) => {
  console.error("[benchmark-renderer:error]", event.message, event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[benchmark-renderer:unhandledrejection]", event.reason);
});

console.log("[benchmark-renderer:bootstrap]", {
  hasBenchmarkHost: Boolean(window.benchmarkHost)
});

createRoot(document.getElementById("root")!).render(<BenchmarkDesktopApp host={window.benchmarkHost} />);
