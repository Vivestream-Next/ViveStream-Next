import {
  onMount,
  onCleanup,
  For,
  Show,
  createSignal,
  createMemo,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  downloadUrl,
  setDownloadUrl,
  downloadQuality,
  updateDownloadQuality,
  tasks,
  isProcessingQueue,
  startDownloadQueue,
  updateTask,
  downloadType,
  updateDownloadType,
  dlSubtitles,
  toggleDlSubtitles,
  liveFromStart,
  toggleLiveFromStart,
  clearDownloadHistory,
  addToast,
  getSystemClipboardText,
  setSystemClipboardText,
  isFetchingInfo,
  fetchingUrl,
  downloadHistory,
  fetchDownloadHistory,
  clearDatabaseHistory,
  deleteHistoryItem,
  retryDownload,
  cancelDownload,
  removeTaskFromQueue,
  setDialogState,
  historySortBy,
  historySortDirection,
  transcribeTrackQuick,
} from "../store";
import { sortDownloadHistory } from "../utils/sortUtils";
import "./Downloads.css";

export default function Downloads() {
  let navigate: (path: string) => void;
  try {
    navigate = useNavigate();
  } catch {
    navigate = (path: string) => {
      window.location.href = path;
    };
  }

  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"Active Queue" | "History">(
    "Active Queue",
  );

  const displayedHistory = createMemo(() => {
    return sortDownloadHistory(
      downloadHistory() || [],
      historySortBy(),
      historySortDirection(),
    );
  });

  let dropdownRef: HTMLDivElement | undefined;
  const qualities = ["720p", "1080p", "1440p", "4K", "Best"];

  onMount(() => {
    fetchDownloadHistory();

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() =>
      document.removeEventListener("mousedown", handleClickOutside),
    );
  });

  // Summary Metrics for Active Queue
  const queueSummary = createMemo(() => {
    const all = tasks();
    return {
      total: all.length,
      active: all.filter((t) => t.status === "downloading").length,
      pending: all.filter((t) => t.status === "pending").length,
      done: all.filter((t) => t.status === "done").length,
      failed: all.filter(
        (t) => t.status === "error" || t.status === "cancelled",
      ).length,
    };
  });

  const hasClearableQueue = createMemo(() => {
    return tasks().some(
      (t) =>
        t.status === "done" || t.status === "error" || t.status === "cancelled",
    );
  });

  const handleClearClick = () => {
    if (activeTab() === "Active Queue") {
      clearDownloadHistory();
      addToast("Cleared completed items from queue", "success");
    } else {
      setDialogState({
        title: "Clear Download History?",
        message:
          "Are you sure you want to permanently clear all download history records? (Your downloaded media files will remain intact).",
        confirmText: "Clear History",
        cancelText: "Cancel",
        isDestructive: true,
        onConfirm: () => clearDatabaseHistory(),
      });
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div class="page-wrapper downloads-page">
      {/* URL Input & Options Bar */}
      <div class="clay-input-group">
        <div class="clay-input-row">
          <i class="ph ph-link" aria-hidden="true"></i>
          <input
            type="text"
            placeholder="Paste video or playlist URL..."
            value={downloadUrl()}
            onInput={(e) => setDownloadUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isProcessingQueue() && downloadUrl()) {
                startDownloadQueue();
              }
            }}
            aria-label="Video or Playlist Download URL"
          />
          <button
            type="button"
            class="clay-paste-btn"
            onClick={async () => {
              try {
                const text = await getSystemClipboardText();
                if (text && text.trim().startsWith("http")) {
                  setDownloadUrl(text.trim());
                  addToast("URL pasted from clipboard!", "success");
                } else if (text && text.trim()) {
                  setDownloadUrl(text.trim());
                  addToast("Pasted clipboard text", "info");
                } else {
                  addToast("Clipboard is empty", "info");
                }
              } catch {
                addToast("Clipboard access denied or unavailable", "error");
              }
            }}
            title="Paste from Clipboard"
            aria-label="Paste from Clipboard"
          >
            <i class="ph ph-clipboard-text" aria-hidden="true"></i>
            <span class="paste-text">Paste</span>
          </button>
          <button
            type="button"
            class="dl-action-btn"
            onClick={startDownloadQueue}
            disabled={isProcessingQueue() || !downloadUrl()}
            title="Download Video/Playlist"
            aria-label="Start Download Queue"
          >
            <i
              class={
                isProcessingQueue()
                  ? "ph-fill ph-spinner spinIcon"
                  : "ph-fill ph-download-simple"
              }
              aria-hidden="true"
            ></i>
          </button>
        </div>

        {/* Quick Format Presets */}
        <div
          class="quick-presets-row"
          role="toolbar"
          aria-label="Format presets"
        >
          <span class="preset-label">Presets:</span>
          <button
            type="button"
            class={`preset-chip ${downloadType() === "Audio" ? "active" : ""}`}
            onClick={() => {
              updateDownloadType("Audio");
              addToast("Format preset: Audio Only (MP3)", "info");
            }}
          >
            <i class="ph-fill ph-music-notes"></i> Audio Only
          </button>
          <button
            type="button"
            class={`preset-chip ${downloadType() === "Video" && downloadQuality() === "720p" ? "active" : ""}`}
            onClick={() => {
              updateDownloadType("Video");
              updateDownloadQuality("720p");
              addToast("Format preset: 720p HD Video", "info");
            }}
          >
            <i class="ph-fill ph-lightning"></i> 720p Fast
          </button>
          <button
            type="button"
            class={`preset-chip ${downloadType() === "Video" && downloadQuality() === "1080p" ? "active" : ""}`}
            onClick={() => {
              updateDownloadType("Video");
              updateDownloadQuality("1080p");
              addToast("Format preset: 1080p Full HD Video", "info");
            }}
          >
            <i class="ph-fill ph-film-slate"></i> 1080p FHD
          </button>
          <button
            type="button"
            class={`preset-chip ${downloadType() === "Video" && downloadQuality() === "Best" ? "active" : ""}`}
            onClick={() => {
              updateDownloadType("Video");
              updateDownloadQuality("Best");
              addToast("Format preset: Best Quality / 4K", "info");
            }}
          >
            <i class="ph-fill ph-sparkle"></i> Best / 4K
          </button>
        </div>

        <div class="clay-options-row">
          <div
            class="segmented-control"
            role="radiogroup"
            aria-label="Download format type"
          >
            <button
              type="button"
              class={`segmented-btn ${downloadType() === "Video" ? "active" : ""}`}
              onClick={() => updateDownloadType("Video")}
              role="radio"
              aria-checked={downloadType() === "Video"}
            >
              Video
            </button>
            <button
              type="button"
              class={`segmented-btn ${downloadType() === "Audio" ? "active" : ""}`}
              onClick={() => updateDownloadType("Audio")}
              role="radio"
              aria-checked={downloadType() === "Audio"}
            >
              Audio
            </button>
          </div>

          <div class="option-item">
            Quality:
            <div
              class={`custom-select-wrapper ${dropdownOpen() ? "open" : ""}`}
              ref={dropdownRef}
            >
              <div
                class="custom-select-trigger"
                onClick={() => setDropdownOpen(!dropdownOpen())}
              >
                <span>
                  {downloadQuality() === "Best"
                    ? "Best Available"
                    : `${downloadQuality()}`}
                </span>
                <i class="ph ph-caret-down"></i>
              </div>
              <div class="custom-select-menu">
                <For each={qualities}>
                  {(q) => (
                    <div
                      class={`custom-select-item ${downloadQuality() === q ? "selected" : ""}`}
                      onClick={() => {
                        updateDownloadQuality(q);
                        setDropdownOpen(false);
                      }}
                    >
                      {q === "Best" ? "Best Available" : `${q}`}
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          <div class="option-item">
            Subtitles:
            <label class="switch">
              <input
                type="checkbox"
                checked={dlSubtitles()}
                onChange={(e) => toggleDlSubtitles(e.target.checked)}
              />
              <span class="slider"></span>
            </label>
          </div>

          <div class="option-item">
            Live Stream:
            <label class="switch" title="Download Live from Start">
              <input
                type="checkbox"
                checked={liveFromStart()}
                onChange={(e) => toggleLiveFromStart(e.target.checked)}
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Tabs Header & Dynamic Clear Button */}
      <div class="tabs-header">
        <div class="tabs-controls">
          <button
            class={`tab-btn ${activeTab() === "Active Queue" ? "active" : ""}`}
            onClick={() => setActiveTab("Active Queue")}
          >
            Active Queue
            <Show when={tasks().length > 0}>
              <span class="tab-badge">{tasks().length}</span>
            </Show>
          </button>
          <button
            class={`tab-btn ${activeTab() === "History" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("History");
              fetchDownloadHistory();
            }}
          >
            History
            <Show when={(downloadHistory() || []).length > 0}>
              <span class="tab-badge secondary">
                {(downloadHistory() || []).length}
              </span>
            </Show>
          </button>
        </div>

        <button
          class="clear-history-btn"
          onClick={handleClearClick}
          disabled={
            activeTab() === "Active Queue"
              ? !hasClearableQueue()
              : (downloadHistory() || []).length === 0
          }
          title={
            activeTab() === "Active Queue"
              ? "Clear Completed & Failed from Queue"
              : "Clear Database Download History"
          }
        >
          <i class="ph-fill ph-trash"></i>
          <span>
            {activeTab() === "Active Queue"
              ? "Clear Completed"
              : "Clear History"}
          </span>
        </button>
      </div>

      {/* ACTIVE QUEUE TAB */}
      <Show when={activeTab() === "Active Queue"}>
        {/* Dynamic Summary Bar */}
        <Show when={tasks().length > 0 || isFetchingInfo()}>
          <div class="queue-summary-bar">
            <div class="summary-chip total">
              <i class="ph ph-stack"></i> Total: <b>{queueSummary().total}</b>
            </div>
            <div class="summary-chip active">
              <i class="ph ph-spinner spinIcon"></i> Active:{" "}
              <b>{queueSummary().active}</b>
            </div>
            <div class="summary-chip pending">
              <i class="ph ph-clock"></i> Queued:{" "}
              <b>{queueSummary().pending}</b>
            </div>
            <div class="summary-chip done">
              <i class="ph-fill ph-check-circle"></i> Done:{" "}
              <b>{queueSummary().done}</b>
            </div>
            <div class="summary-chip failed">
              <i class="ph-fill ph-warning-circle"></i> Failed:{" "}
              <b>{queueSummary().failed}</b>
            </div>
          </div>
        </Show>

        {/* Fetching Info Placeholder */}
        <Show when={isFetchingInfo()}>
          <div class="fetching-placeholder-card">
            <div class="placeholder-icon-box">
              <i class="ph ph-spinner spinIcon"></i>
            </div>
            <div class="placeholder-info">
              <h4>Fetching Video Information...</h4>
              <p class="placeholder-url">{fetchingUrl()}</p>
            </div>
            <div class="placeholder-shimmer"></div>
          </div>
        </Show>

        {/* Empty State */}
        <Show when={tasks().length === 0 && !isFetchingInfo()}>
          <div class="empty-queue-state">
            <i class="ph-fill ph-tray empty-icon"></i>
            <span class="empty-message">Your download queue is empty.</span>
            <p class="empty-subtext">
              Paste a YouTube URL above to queue downloads.
            </p>
          </div>
        </Show>

        {/* Task Cards Grid */}
        <Show when={tasks().length > 0}>
          <div class="download-task-list">
            <For each={tasks()}>
              {(task) => (
                <div
                  class={`download-task-card ${
                    task.status === "error"
                      ? "error"
                      : task.status === "done"
                        ? "done"
                        : task.status === "cancelled"
                          ? "cancelled"
                          : ""
                  }`}
                >
                  <div class="download-task-row">
                    <div class="task-thumb-wrapper">
                      <img
                        src={`https://i.ytimg.com/vi/${task.id}/hqdefault.jpg`}
                        class="task-thumbnail"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90' fill='%23222'%3E%3Crect width='100%25' height='100%25'/%3E%3C/svg%3E";
                        }}
                      />
                      <Show when={task.dlType}>
                        <span class="task-type-badge">{task.dlType}</span>
                      </Show>
                    </div>

                    <div class="task-meta">
                      <h4 class="task-title" title={task.title}>
                        {task.title}
                      </h4>
                      <p class="task-channel">{task.channel}</p>

                      {/* Progress Bar */}
                      <div class="task-progress">
                        <div
                          class={`progress-fill ${
                            task.status === "done"
                              ? "done"
                              : task.status === "error"
                                ? "error"
                                : task.phase.includes("Transcoding")
                                  ? "transcoding"
                                  : ""
                          }`}
                          style={{ width: `${task.progress}%` }}
                        ></div>
                      </div>

                      {/* Stats & Progress Details */}
                      <div class="task-stats">
                        <div class="task-state-box">
                          <Show when={task.status === "pending"}>
                            <span class="task-state pending">
                              <i class="ph ph-clock"></i>{" "}
                              {task.phase || "Queued"}
                            </span>
                          </Show>
                          <Show when={task.status === "downloading"}>
                            <span class="task-state downloading">
                              <i class="ph ph-spinner spinIcon"></i>{" "}
                              {task.phase || "Downloading"}
                            </span>
                          </Show>
                          <Show when={task.status === "done"}>
                            <span class="task-state done">
                              <i class="ph-fill ph-check-circle"></i> Complete
                            </span>
                          </Show>
                          <Show when={task.status === "error"}>
                            <span class="task-state error">
                              <i class="ph-fill ph-warning-circle"></i> Failed
                            </span>
                          </Show>
                          <Show when={task.status === "cancelled"}>
                            <span class="task-state cancelled">
                              <i class="ph ph-x-circle"></i> Cancelled
                            </span>
                          </Show>
                        </div>

                        <div class="task-metrics">
                          <Show when={task.speed}>
                            <span class="metric-badge speed" title="Speed">
                              <i class="ph ph-gauge"></i> {task.speed}
                            </span>
                          </Show>
                          <Show
                            when={task.eta && task.status === "downloading"}
                          >
                            <span
                              class="metric-badge eta"
                              title="Estimated Time Remaining"
                            >
                              <i class="ph ph-timer"></i> {task.eta}
                            </span>
                          </Show>
                          <Show when={task.status === "downloading"}>
                            <span class="metric-badge pct">
                              {Math.round(task.progress)}%
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Task Card Actions Bar */}
                  <div class="task-card-footer">
                    <div class="task-control-actions">
                      <Show
                        when={
                          task.status === "error" || task.status === "cancelled"
                        }
                      >
                        <button
                          class="task-ctrl-btn retry-btn"
                          onClick={() => retryDownload(task.id)}
                          title="Retry Download"
                        >
                          <i class="ph ph-arrow-counter-clockwise"></i> Retry
                        </button>
                      </Show>

                      <Show
                        when={
                          task.status === "pending" ||
                          task.status === "downloading"
                        }
                      >
                        <button
                          class="task-ctrl-btn cancel-btn"
                          onClick={() => cancelDownload(task.id)}
                          title="Cancel Download"
                        >
                          <i class="ph ph-x"></i> Cancel
                        </button>
                      </Show>

                      <Show when={task.status === "done"}>
                        <button
                          class="task-ctrl-btn play-btn"
                          onClick={() => navigate(`/player/${task.id}`)}
                          title="Play Video"
                        >
                          <i class="ph-fill ph-play"></i> Play
                        </button>
                        <button
                          class="task-ctrl-btn lyrics-btn"
                          onClick={async () => {
                            if (task.metadata?.video_path) {
                              await transcribeTrackQuick(task.id, task.metadata.video_path, task.title);
                            }
                          }}
                          title="Generate Synced Lyrics with Whisper"
                        >
                          <i class="ph-bold ph-waveform"></i> Lyrics
                        </button>
                      </Show>

                      <button
                        class="task-ctrl-btn remove-btn"
                        onClick={() => removeTaskFromQueue(task.id)}
                        title="Remove from queue"
                      >
                        <i class="ph ph-trash"></i>
                      </button>
                    </div>

                    <button
                      onClick={() =>
                        updateTask(task.id, { showLogs: !task.showLogs })
                      }
                      class={`task-toggle-btn ${task.showLogs ? "active" : ""} ${
                        task.status === "error" ? "btn-error-glow" : ""
                      }`}
                    >
                      <i class="ph ph-terminal-window"></i>{" "}
                      {task.showLogs ? "Hide Logs" : "Show Logs"}
                    </button>
                  </div>

                  {/* Expandable Logs Drawer */}
                  <Show when={task.showLogs}>
                    <div class="terminal-wrapper">
                      <div class="terminal-header-row">
                        <span class="terminal-title">Console Output</span>
                        <button
                          class="task-copy-btn"
                          onClick={async () => {
                            await setSystemClipboardText(task.logs.join("\n"));
                            addToast("Logs copied to clipboard", "success");
                          }}
                          title="Copy Logs"
                        >
                          <i class="ph ph-copy"></i> Copy
                        </button>
                      </div>
                      <div class="terminal-block">
                        <For each={task.logs}>
                          {(log) => <div class="task-log-line">{log}</div>}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* HISTORY TAB */}
      <Show when={activeTab() === "History"}>
        <Show when={(downloadHistory() || []).length === 0}>
          <div class="empty-queue-state">
            <i class="ph-fill ph-clock-counter-clockwise empty-icon"></i>
            <span class="empty-message">No download history yet.</span>
            <p class="empty-subtext">
              Completed and attempted downloads will be logged here.
            </p>
          </div>
        </Show>

        <Show when={(downloadHistory() || []).length > 0}>
          <div class="history-list">
            <For each={displayedHistory()}>
              {(item) => (
                <div class={`history-card ${item.status}`}>
                  <div
                    class={`history-thumb-container ${item.status === "done" ? "clickable" : ""}`}
                    onClick={() => {
                      if (item.status === "done") {
                        navigate(`/player/${item.video_id}`);
                      }
                    }}
                  >
                    <img
                      src={`https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`}
                      class="history-thumbnail"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.src =
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90' fill='%23222'%3E%3Crect width='100%25' height='100%25'/%3E%3C/svg%3E";
                      }}
                    />
                    <Show when={item.status === "done"}>
                      <div class="history-play-overlay">
                        <i class="ph-fill ph-play"></i>
                      </div>
                    </Show>
                  </div>

                  <div class="history-content">
                    <div class="history-main-info">
                      <h4 class="history-title" title={item.title}>
                        {item.title}
                      </h4>
                      <p class="history-channel">{item.channel}</p>
                    </div>

                    <div class="history-meta-row">
                      <div class="history-badges">
                        <span class={`history-status-chip ${item.status}`}>
                          <Show when={item.status === "done"}>
                            <i class="ph-fill ph-check-circle"></i> Completed
                          </Show>
                          <Show when={item.status === "error"}>
                            <i class="ph-fill ph-warning-circle"></i> Failed
                          </Show>
                          <Show when={item.status === "cancelled"}>
                            <i class="ph ph-x-circle"></i> Cancelled
                          </Show>
                        </span>

                        <span class="history-type-chip">
                          {item.dl_type || "Video"}
                        </span>

                        <span class="history-date">
                          <i class="ph ph-calendar-blank"></i>{" "}
                          {formatDate(item.created_at)}
                        </span>
                      </div>

                      <div class="history-actions">
                        <Show when={item.status === "done"}>
                          <button
                            class="history-action-btn play"
                            onClick={() => navigate(`/player/${item.video_id}`)}
                            title="Play Video"
                          >
                            <i class="ph-fill ph-play"></i> Play
                          </button>
                        </Show>

                        <button
                          class="history-action-btn reuse"
                          onClick={() => {
                            setDownloadUrl(item.url);
                            setActiveTab("Active Queue");
                            addToast("URL inserted into queue input", "info");
                          }}
                          title="Reuse URL in Download Input"
                        >
                          <i class="ph ph-arrow-clockwise"></i> Reuse URL
                        </button>

                        <button
                          class="history-action-btn icon-only copy"
                          onClick={async () => {
                            await setSystemClipboardText(item.url);
                            addToast("URL copied to clipboard", "success");
                          }}
                          title="Copy Original URL"
                        >
                          <i class="ph ph-copy"></i>
                        </button>

                        <button
                          class="history-action-btn icon-only delete"
                          onClick={() => deleteHistoryItem(item.id)}
                          title="Delete History Record"
                        >
                          <i class="ph ph-trash"></i>
                        </button>
                      </div>
                    </div>

                    <Show when={item.error_msg}>
                      <div class="history-error-row" title={item.error_msg}>
                        <i class="ph ph-warning"></i> {item.error_msg}
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
