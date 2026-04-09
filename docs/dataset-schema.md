# Dataset Schema

The shared dataset is stored at `packages/dataset/assets/benchmark-dataset.json`.

## Top-Level Shape

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-04-09T00:00:00.000Z",
  "itemCount": 10000,
  "items": []
}
```

## Item Shape

Each item contains fields that support rendering, searching, filtering, file persistence, and CPU-heavy transformation.

```json
{
  "id": 1,
  "slug": "item-00001",
  "title": "Record 1",
  "category": "analytics",
  "status": "active",
  "priority": "high",
  "owner": {
    "id": "owner-01",
    "name": "Owner 01",
    "region": "na",
    "team": "platform"
  },
  "tags": ["desktop", "benchmark", "alpha", "group-1"],
  "scores": {
    "quality": 74,
    "throughput": 58,
    "latency": 22,
    "stability": 81
  },
  "counters": {
    "views": 1820,
    "clicks": 305,
    "errors": 4,
    "retries": 2
  },
  "flags": {
    "isPinned": false,
    "isArchived": false,
    "requiresReview": true
  },
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-10T12:00:00.000Z",
  "summary": "Human-readable summary used by the list and search UI.",
  "notes": "Longer repeated text so the serialized JSON asset reaches approximately 10 MB."
}
```

## Heavy Task Contract

The shared heavy task must:

1. Load the 10 MB dataset file
2. Parse JSON
3. Run the same transformation loop 30 times
4. Compute grouped statistics by category, status, region, and priority
5. Return summarized output

The transformation algorithm lives in `packages/workload/src/index.ts` so every framework executes the same TypeScript logic.
