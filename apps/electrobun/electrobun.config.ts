import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Desktop Framework Benchmark Electrobun",
    identifier: "com.mohitsharma.desktopframeworkbenchmark.electrobun",
    version: "0.1.0"
  },
  runtime: {
    exitOnLastWindowClosed: true
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts"
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.tsx"
      }
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
      "resources/dataset/benchmark-dataset.json": "views/assets/dataset/benchmark-dataset.json",
      "resources/dataset/mock-api-response.json": "views/assets/dataset/mock-api-response.json"
    }
  }
} satisfies ElectrobunConfig;

