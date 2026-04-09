import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const datasetPath = resolve(currentDir, "../packages/dataset/assets/benchmark-dataset.json");
const mockApiPath = resolve(currentDir, "../packages/dataset/assets/mock-api-response.json");

const categories = ["analytics", "billing", "content", "ops", "platform", "sales"];
const statuses = ["active", "paused", "draft", "error", "complete"];
const priorities = ["low", "medium", "high", "urgent"];
const regions = ["na", "emea", "apac", "latam"];
const teams = ["platform", "growth", "support", "core"];
const tags = [
  "desktop",
  "benchmark",
  "react",
  "vite",
  "window",
  "storage",
  "network",
  "analysis",
  "metrics",
  "runtime"
];

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260409);

function pick(list, index) {
  return list[index % list.length];
}

function pad(value, size) {
  return String(value).padStart(size, "0");
}

function makeNotes(index) {
  return `Synthetic benchmark note ${index}. Shared fields keep transformations stable.`;
}

const items = [];

for (let index = 0; index < 10000; index += 1) {
  const id = index + 1;
  const category = pick(categories, index);
  const status = pick(statuses, index * 3);
  const priority = pick(priorities, index * 5);
  const region = pick(regions, index * 7);
  const team = pick(teams, index * 11);
  const ownerId = `owner-${pad((index % 250) + 1, 3)}`;
  const summary = `Record ${id} tracks ${category} work in ${region} with ${status} status.`;
  const notes = makeNotes(index);
  const tagSet = [
    pick(tags, index),
    pick(tags, index + 2),
    pick(tags, index + 4),
    `group-${(index % 24) + 1}`
  ];
  const title = `Record ${pad(id, 5)} ${category} ${priority}`;
  items.push({
    id,
    slug: `item-${pad(id, 5)}`,
    title,
    category,
    status,
    priority,
    owner: {
      id: ownerId,
      name: `Owner ${pad((index % 250) + 1, 3)}`,
      region,
      team
    },
    tags: tagSet,
    scores: {
      quality: Math.floor(random() * 100),
      throughput: Math.floor(random() * 100),
      latency: Math.floor(random() * 100),
      stability: Math.floor(random() * 100)
    },
    counters: {
      views: Math.floor(random() * 5000) + 500,
      clicks: Math.floor(random() * 1200) + 50,
      errors: Math.floor(random() * 12),
      retries: Math.floor(random() * 8)
    },
    flags: {
      isPinned: index % 17 === 0,
      isArchived: status === "complete" && index % 9 === 0,
      requiresReview: index % 6 === 0 || status === "error"
    },
    createdAt: new Date(Date.UTC(2025, index % 12, (index % 28) + 1, 8, 30, 0)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, index % 12, (index % 28) + 1, 12, 45, 0)).toISOString(),
    summary,
    notes
  });
}

const dataset = {
  schemaVersion: 1,
  generatedAt: "2026-04-09T00:00:00.000Z",
  itemCount: items.length,
  items
};

const mockApiResponse = {
  generatedAt: "2026-04-09T00:00:00.000Z",
  summary: {
    totalItems: items.length,
    activeItems: items.filter((item) => item.status === "active").length,
    erroredItems: items.filter((item) => item.status === "error").length
  },
  alerts: [
    {
      id: "alert-001",
      severity: "info",
      message: "Benchmark fixture loaded successfully."
    },
    {
      id: "alert-002",
      severity: "warning",
      message: "One data segment contains synthetic error states for dashboard testing."
    },
    {
      id: "alert-003",
      severity: "critical",
      message: "This alert exists to validate severity filtering and visual treatment."
    }
  ]
};

mkdirSync(dirname(datasetPath), { recursive: true });
writeFileSync(datasetPath, JSON.stringify(dataset, null, 2));
writeFileSync(mockApiPath, JSON.stringify(mockApiResponse, null, 2));

const datasetSizeBytes = Buffer.byteLength(JSON.stringify(dataset, null, 2));
console.log(`Generated ${datasetPath}`);
console.log(`Generated ${mockApiPath}`);
console.log(`Dataset size: ${datasetSizeBytes} bytes`);
