export const DATASET_FILE_NAME = "benchmark-dataset.json";
export const MOCK_API_FILE_NAME = "mock-api-response.json";

export const DATASET_RELATIVE_PATH = "../assets/benchmark-dataset.json";
export const MOCK_API_RELATIVE_PATH = "../assets/mock-api-response.json";

export type DatasetCategory =
  | "analytics"
  | "billing"
  | "content"
  | "ops"
  | "platform"
  | "sales";

export type DatasetStatus =
  | "active"
  | "paused"
  | "draft"
  | "error"
  | "complete";

export type DatasetPriority = "low" | "medium" | "high" | "urgent";
export type DatasetRegion = "na" | "emea" | "apac" | "latam";
export type DatasetTeam = "platform" | "growth" | "support" | "core";

export interface DatasetItem {
  id: number;
  slug: string;
  title: string;
  category: DatasetCategory;
  status: DatasetStatus;
  priority: DatasetPriority;
  owner: {
    id: string;
    name: string;
    region: DatasetRegion;
    team: DatasetTeam;
  };
  tags: string[];
  scores: {
    quality: number;
    throughput: number;
    latency: number;
    stability: number;
  };
  counters: {
    views: number;
    clicks: number;
    errors: number;
    retries: number;
  };
  flags: {
    isPinned: boolean;
    isArchived: boolean;
    requiresReview: boolean;
  };
  createdAt: string;
  updatedAt: string;
  summary: string;
  notes: string;
}

export interface BenchmarkDataset {
  schemaVersion: number;
  generatedAt: string;
  itemCount: number;
  items: DatasetItem[];
}

export interface MockApiResponse {
  generatedAt: string;
  summary: {
    totalItems: number;
    activeItems: number;
    erroredItems: number;
  };
  alerts: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    message: string;
  }>;
}
