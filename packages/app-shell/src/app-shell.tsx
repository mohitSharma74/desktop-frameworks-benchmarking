import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";

import type { BenchmarkAutomationConfig, BenchmarkEventName } from "@benchmark/benchmark-core";
import type { BenchmarkDataset, DatasetItem, MockApiResponse } from "@benchmark/dataset";
import { filterItems, runHeavyTask, type FilterOptions, type HeavyTaskSummary } from "@benchmark/workload";

import type { AppShellProps, PersistedAppState } from "./types";

const DEFAULT_FILTERS: FilterOptions = {
  query: "",
  category: "all",
  status: "all",
  priority: "all",
  region: "all"
};

function summarizeVisibleItems(items: DatasetItem[]) {
  let pinned = 0;
  let reviewRequired = 0;
  let totalViews = 0;

  for (const item of items) {
    totalViews += item.counters.views;
    if (item.flags.isPinned) {
      pinned += 1;
    }

    if (item.flags.requiresReview) {
      reviewRequired += 1;
    }
  }

  return {
    count: items.length,
    pinned,
    reviewRequired,
    totalViews
  };
}

function safeJsonParse<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function BenchmarkDesktopApp({ host }: AppShellProps) {
  const [dataset, setDataset] = useState<BenchmarkDataset | null>(null);
  const [mockApiResponse, setMockApiResponse] = useState<MockApiResponse | null>(null);
  const [datasetBytes, setDatasetBytes] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkAutomationConfig | null>(null);
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [openedFiles, setOpenedFiles] = useState<string[]>([]);
  const [taskSummary, setTaskSummary] = useState<HeavyTaskSummary | null>(null);
  const [taskDurationMs, setTaskDurationMs] = useState<number | null>(null);
  const [runningTask, setRunningTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [lastStorageWriteAt, setLastStorageWriteAt] = useState<string | null>(null);
  const automationTriggeredRef = useRef(false);

  const deferredFilters = useDeferredValue(filters);
  const visibleItems = dataset ? filterItems(dataset.items, deferredFilters) : [];
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? null;
  const visibleSummary = summarizeVisibleItems(visibleItems);

  const emitBenchmarkEvent = useEffectEvent(
    (eventName: BenchmarkEventName, payload?: Record<string, unknown>) => {
      host.emitBenchmarkEvent(eventName, payload);
    }
  );

  const persistState = useEffectEvent(async (nextState: PersistedAppState) => {
    await host.writePersistedState(nextState);
    setLastStorageWriteAt(new Date().toISOString());
  });

  useEffect(() => {
    let cancelled = false;

    requestAnimationFrame(() => {
      if (!cancelled) {
        emitBenchmarkEvent("bench:first-paint", {
          framework: host.framework
        });
      }
    });

    void (async () => {
      const bootStartedAt = performance.now();

      try {
        const [resolvedBenchmarkConfig, resolvedDatasetText, resolvedPersistedState, resolvedApiBaseUrl] = await Promise.all([
          host.getBenchmarkConfig(),
          host.loadDatasetText(),
          host.readPersistedState(),
          host.getMockApiBaseUrl()
        ]);
        const response = await fetch(`${resolvedApiBaseUrl}/api/dashboard`);
        const parsedDataset = safeJsonParse<BenchmarkDataset>(resolvedDatasetText);
        const parsedApiResponse = (await response.json()) as MockApiResponse;

        if (cancelled) {
          return;
        }

        setDataset(parsedDataset);
        setMockApiResponse(parsedApiResponse);
        setDatasetBytes(resolvedDatasetText.length);
        setBenchmarkConfig(resolvedBenchmarkConfig);

        if (resolvedPersistedState) {
          setFilters({
            ...DEFAULT_FILTERS,
            ...resolvedPersistedState.filters
          });
          setSelectedItemId(resolvedPersistedState.selectedItemId);
          setNotes(resolvedPersistedState.notes);
          setOpenedFiles(resolvedPersistedState.lastOpenedFiles);
        }

        setBooting(false);
        emitBenchmarkEvent("bench:ready", {
          datasetBytes: resolvedDatasetText.length,
          itemCount: parsedDataset.itemCount,
          automationMode: resolvedBenchmarkConfig?.mode ?? null,
          bootDurationMs: Number((performance.now() - bootStartedAt).toFixed(2))
        });

        requestAnimationFrame(() => {
          if (!cancelled) {
            emitBenchmarkEvent("bench:interactive", {
              itemCount: parsedDataset.itemCount
            });
          }
        });
      } catch (error) {
        if (!cancelled) {
          setBooting(false);
          setBootError(error instanceof Error ? error.message : "Unknown boot error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [emitBenchmarkEvent, host]);

  useEffect(() => {
    if (!dataset || booting || benchmarkConfig?.mode !== "heavy-task" || automationTriggeredRef.current) {
      return;
    }

    automationTriggeredRef.current = true;

    const handle = window.setTimeout(() => {
      void handleRunHeavyTask();
    }, benchmarkConfig.delayMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [benchmarkConfig, booting, dataset]);

  useEffect(() => {
    if (!dataset || booting) {
      return;
    }

    const handle = window.setTimeout(() => {
      void persistState({
        filters,
        selectedItemId,
        notes,
        lastOpenedFiles: openedFiles
      });
    }, 150);

    return () => {
      window.clearTimeout(handle);
    };
  }, [booting, dataset, filters, notes, openedFiles, persistState, selectedItemId]);

  async function handleRunHeavyTask() {
    setRunningTask(true);
    setTaskError(null);
    setTaskSummary(null);
    setTaskDurationMs(null);
    emitBenchmarkEvent("bench:task:start", {
      framework: host.framework
    });

    const taskStartedAt = performance.now();

    try {
      const datasetText = await host.loadDatasetText();
      const parsedDataset = safeJsonParse<BenchmarkDataset>(datasetText);
      const summary = runHeavyTask(parsedDataset);
      const durationMs = Number((performance.now() - taskStartedAt).toFixed(2));

      setTaskSummary(summary);
      setTaskDurationMs(durationMs);
      emitBenchmarkEvent("bench:task:end", {
        durationMs,
        iterations: summary.iterations,
        itemCount: summary.itemCount
      });
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Heavy task failed");
    } finally {
      setRunningTask(false);
    }
  }

  async function handleOpenFilePicker() {
    const filePaths = await host.openNativeFilePicker();
    setOpenedFiles(filePaths);
  }

  async function handleOpenSecondaryWindow() {
    await host.openSecondaryWindow();
  }

  function updateFilter<K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        [key]: value
      }));
    });
  }

  return (
    <div className="benchmark-shell">
      <aside className="benchmark-sidebar">
        <div className="brand-block">
          <p className="eyebrow">Desktop Benchmark</p>
          <h1>Shared Renderer</h1>
          <p className="lede">
            One React app, hosted by multiple desktop shells, with the exact same workload.
          </p>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <h2>Environment</h2>
            <span>{host.framework}</span>
          </div>
          <dl className="facts-list">
            <div>
              <dt>Dataset size</dt>
              <dd>{datasetBytes.toLocaleString()} bytes</dd>
            </div>
            <div>
              <dt>Rows rendered</dt>
              <dd>{dataset?.itemCount.toLocaleString() ?? "Loading"}</dd>
            </div>
            <div>
              <dt>Storage write</dt>
              <dd>{lastStorageWriteAt ? new Date(lastStorageWriteAt).toLocaleTimeString() : "Pending"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Controls</h2>
          </div>
          <div className="field-stack">
            <label className="field">
              <span>Search</span>
              <input
                value={filters.query}
                onChange={(event) => updateFilter("query", event.currentTarget.value)}
                placeholder="Search title, notes, owner, or tags"
              />
            </label>

            <label className="field">
              <span>Category</span>
              <select
                value={filters.category ?? "all"}
                onChange={(event) =>
                  updateFilter("category", event.currentTarget.value as FilterOptions["category"])
                }
              >
                <option value="all">All</option>
                <option value="analytics">analytics</option>
                <option value="billing">billing</option>
                <option value="content">content</option>
                <option value="ops">ops</option>
                <option value="platform">platform</option>
                <option value="sales">sales</option>
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select
                value={filters.status ?? "all"}
                onChange={(event) =>
                  updateFilter("status", event.currentTarget.value as FilterOptions["status"])
                }
              >
                <option value="all">All</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="draft">draft</option>
                <option value="error">error</option>
                <option value="complete">complete</option>
              </select>
            </label>

            <label className="field">
              <span>Priority</span>
              <select
                value={filters.priority ?? "all"}
                onChange={(event) =>
                  updateFilter("priority", event.currentTarget.value as FilterOptions["priority"])
                }
              >
                <option value="all">All</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </label>

            <label className="field">
              <span>Region</span>
              <select
                value={filters.region ?? "all"}
                onChange={(event) =>
                  updateFilter("region", event.currentTarget.value as FilterOptions["region"])
                }
              >
                <option value="all">All</option>
                <option value="na">na</option>
                <option value="emea">emea</option>
                <option value="apac">apac</option>
                <option value="latam">latam</option>
              </select>
            </label>

            <label className="field">
              <span>Notes</span>
              <textarea
                rows={6}
                value={notes}
                onChange={(event) => setNotes(event.currentTarget.value)}
                placeholder="Write something here to exercise native file persistence."
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Native Actions</h2>
          </div>
          <div className="button-row">
            <button type="button" onClick={handleOpenSecondaryWindow}>
              Open secondary window
            </button>
            <button type="button" onClick={handleOpenFilePicker}>
              Open file picker
            </button>
            <button type="button" onClick={handleRunHeavyTask} disabled={runningTask}>
              {runningTask ? "Running heavy task" : "Run heavy task"}
            </button>
          </div>

          {openedFiles.length > 0 ? (
            <ul className="file-list">
              {openedFiles.map((filePath) => (
                <li key={filePath}>{filePath}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No file selected yet.</p>
          )}
        </section>
      </aside>

      <main className="benchmark-main">
        <section className="hero-strip">
          <div className="metric-card accent">
            <span>Visible items</span>
            <strong>{visibleSummary.count.toLocaleString()}</strong>
          </div>
          <div className="metric-card">
            <span>Pinned</span>
            <strong>{visibleSummary.pinned.toLocaleString()}</strong>
          </div>
          <div className="metric-card">
            <span>Needs review</span>
            <strong>{visibleSummary.reviewRequired.toLocaleString()}</strong>
          </div>
          <div className="metric-card">
            <span>Total views</span>
            <strong>{visibleSummary.totalViews.toLocaleString()}</strong>
          </div>
        </section>

        {bootError ? (
          <section className="panel danger">
            <h2>Boot failure</h2>
            <p>{bootError}</p>
          </section>
        ) : null}

        <section className="content-grid">
          <section className="panel tall">
            <div className="panel-heading">
              <h2>Mock API Summary</h2>
              <span>{mockApiResponse ? "HTTP success" : booting ? "Loading" : "Unavailable"}</span>
            </div>

            {mockApiResponse ? (
              <>
                <div className="metric-row">
                  <div className="mini-card">
                    <span>Total items</span>
                    <strong>{mockApiResponse.summary.totalItems.toLocaleString()}</strong>
                  </div>
                  <div className="mini-card">
                    <span>Active</span>
                    <strong>{mockApiResponse.summary.activeItems.toLocaleString()}</strong>
                  </div>
                  <div className="mini-card">
                    <span>Errored</span>
                    <strong>{mockApiResponse.summary.erroredItems.toLocaleString()}</strong>
                  </div>
                </div>

                <ul className="alerts-list">
                  {mockApiResponse.alerts.map((alert) => (
                    <li key={alert.id} className={`alert-pill ${alert.severity}`}>
                      <strong>{alert.severity}</strong>
                      <span>{alert.message}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">{booting ? "Loading mock API response..." : "Mock API data is unavailable."}</p>
            )}
          </section>

          <section className="panel tall">
            <div className="panel-heading">
              <h2>Heavy Task</h2>
              <span>{taskDurationMs ? `${taskDurationMs} ms` : "Not run yet"}</span>
            </div>

            {taskError ? <p className="danger-text">{taskError}</p> : null}

            {taskSummary ? (
              <>
                <div className="metric-row">
                  <div className="mini-card">
                    <span>Iterations</span>
                    <strong>{taskSummary.iterations}</strong>
                  </div>
                  <div className="mini-card">
                    <span>Items</span>
                    <strong>{taskSummary.itemCount.toLocaleString()}</strong>
                  </div>
                  <div className="mini-card">
                    <span>Top results</span>
                    <strong>{taskSummary.topItems.length}</strong>
                  </div>
                </div>

                <ol className="top-items-list">
                  {taskSummary.topItems.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <span>{item.slug}</span>
                      <strong>{item.compositeScore}</strong>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="muted">The heavy task re-loads the 10 MB JSON file, parses it, and runs the 30-pass transformation loop.</p>
            )}
          </section>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <h2>10,000 Item List</h2>
            <span>{booting ? "Loading dataset" : `${visibleItems.length.toLocaleString()} visible`}</span>
          </div>

          <div className="list-shell">
            <div className="records-column">
              {dataset ? (
                <ul className="records-list">
                  {visibleItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={item.id === selectedItemId ? "record-card active" : "record-card"}
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        <div className="record-head">
                          <strong>{item.title}</strong>
                          <span>{item.priority}</span>
                        </div>
                        <p>{item.summary}</p>
                        <div className="record-meta">
                          <span>{item.category}</span>
                          <span>{item.status}</span>
                          <span>{item.owner.region}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Loading dataset...</p>
              )}
            </div>

            <div className="detail-column">
              {selectedItem ? (
                <article className="detail-card">
                  <p className="eyebrow">Selected record</p>
                  <h3>{selectedItem.title}</h3>
                  <p>{selectedItem.notes}</p>
                  <dl className="detail-grid">
                    <div>
                      <dt>Owner</dt>
                      <dd>{selectedItem.owner.name}</dd>
                    </div>
                    <div>
                      <dt>Region</dt>
                      <dd>{selectedItem.owner.region}</dd>
                    </div>
                    <div>
                      <dt>Views</dt>
                      <dd>{selectedItem.counters.views.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Errors</dt>
                      <dd>{selectedItem.counters.errors}</dd>
                    </div>
                  </dl>
                </article>
              ) : (
                <div className="detail-empty">
                  <p>Select an item to inspect its details.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
