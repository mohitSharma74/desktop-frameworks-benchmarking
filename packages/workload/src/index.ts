import { DEFAULT_HEAVY_TASK_ITERATIONS } from "@benchmark/benchmark-core";
import type {
  BenchmarkDataset,
  DatasetCategory,
  DatasetItem,
  DatasetPriority,
  DatasetRegion,
  DatasetStatus
} from "@benchmark/dataset";

export interface FilterOptions {
  query: string;
  category?: DatasetCategory | "all";
  status?: DatasetStatus | "all";
  priority?: DatasetPriority | "all";
  region?: DatasetRegion | "all";
}

export interface GroupStat {
  count: number;
  averageQuality: number;
  averageThroughput: number;
  totalViews: number;
  totalErrors: number;
}

export interface HeavyTaskSummary {
  iterations: number;
  itemCount: number;
  totals: {
    categories: Record<string, GroupStat>;
    statuses: Record<string, GroupStat>;
    priorities: Record<string, GroupStat>;
    regions: Record<string, GroupStat>;
  };
  topItems: Array<{
    id: number;
    slug: string;
    compositeScore: number;
  }>;
}

const normalizeQuery = (value: string) => value.trim().toLowerCase();

function buildSearchText(item: DatasetItem): string {
  return [
    item.title,
    item.summary,
    item.notes,
    item.owner.id,
    item.owner.name,
    item.owner.region,
    item.owner.team,
    item.tags.join(" "),
    item.category,
    item.status,
    item.priority
  ]
    .join(" ")
    .toLowerCase();
}

export function filterItems(items: DatasetItem[], options: FilterOptions): DatasetItem[] {
  const query = normalizeQuery(options.query);

  return items.filter((item) => {
    if (options.category && options.category !== "all" && item.category !== options.category) {
      return false;
    }

    if (options.status && options.status !== "all" && item.status !== options.status) {
      return false;
    }

    if (options.priority && options.priority !== "all" && item.priority !== options.priority) {
      return false;
    }

    if (options.region && options.region !== "all" && item.owner.region !== options.region) {
      return false;
    }

    if (!query) {
      return true;
    }

    return buildSearchText(item).includes(query);
  });
}

function createEmptyGroupStat(): GroupStat {
  return {
    count: 0,
    averageQuality: 0,
    averageThroughput: 0,
    totalViews: 0,
    totalErrors: 0
  };
}

function updateGroup(groups: Record<string, GroupStat>, key: string, item: DatasetItem): void {
  const group = groups[key] ?? createEmptyGroupStat();
  group.count += 1;
  group.totalViews += item.counters.views;
  group.totalErrors += item.counters.errors;
  group.averageQuality += item.scores.quality;
  group.averageThroughput += item.scores.throughput;
  groups[key] = group;
}

function finalizeGroups(groups: Record<string, GroupStat>): Record<string, GroupStat> {
  for (const group of Object.values(groups)) {
    if (group.count > 0) {
      group.averageQuality = Number((group.averageQuality / group.count).toFixed(2));
      group.averageThroughput = Number((group.averageThroughput / group.count).toFixed(2));
    }
  }

  return groups;
}

function computeCompositeScore(item: DatasetItem, iteration: number): number {
  const freshnessBias = (iteration % 7) + 1;
  const penalty = item.counters.errors * 2 + item.counters.retries;
  return (
    item.scores.quality * 1.4 +
    item.scores.throughput * 1.2 +
    item.scores.stability * 1.1 -
    item.scores.latency * 0.9 +
    freshnessBias -
    penalty
  );
}

export function runHeavyTask(
  dataset: BenchmarkDataset,
  iterations = DEFAULT_HEAVY_TASK_ITERATIONS
): HeavyTaskSummary {
  const categories: Record<string, GroupStat> = {};
  const statuses: Record<string, GroupStat> = {};
  const priorities: Record<string, GroupStat> = {};
  const regions: Record<string, GroupStat> = {};
  const topItems = new Map<number, { id: number; slug: string; compositeScore: number }>();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const item of dataset.items) {
      updateGroup(categories, item.category, item);
      updateGroup(statuses, item.status, item);
      updateGroup(priorities, item.priority, item);
      updateGroup(regions, item.owner.region, item);

      const compositeScore = computeCompositeScore(item, iteration);
      const current = topItems.get(item.id);
      if (!current || compositeScore > current.compositeScore) {
        topItems.set(item.id, {
          id: item.id,
          slug: item.slug,
          compositeScore: Number(compositeScore.toFixed(2))
        });
      }
    }
  }

  return {
    iterations,
    itemCount: dataset.itemCount,
    totals: {
      categories: finalizeGroups(categories),
      statuses: finalizeGroups(statuses),
      priorities: finalizeGroups(priorities),
      regions: finalizeGroups(regions)
    },
    topItems: Array.from(topItems.values())
      .sort((left, right) => right.compositeScore - left.compositeScore)
      .slice(0, 25)
  };
}
