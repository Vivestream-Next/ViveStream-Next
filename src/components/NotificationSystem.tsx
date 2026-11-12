import { For, Show } from "solid-js";
import {
  toasts,
  dialogState,
  closeDialog,
  engineUpdateReady,
  setEngineUpdateReady,
  engineUpdateDownloading,
  appUpdateDownloading,
  appUpdateInfo,
  setAppUpdateInfo,
  updateProgress,
  installAppUpdate,
  restartApp,
} from "../store";
import "./NotificationSystem.css";

export default function NotificationSystem() {
  const isUpdating = () => engineUpdateDownloading() || appUpdateDownloading();
  const currentProgress = () => updateProgress()?.percentage ?? 0;
  const currentMsg = () =>
    updateProgress()?.message ||
    (appUpdateDownloading()
      ? "Downloading application update..."
      : "Updating stream engines in background...");

  return (
    <div class="notification-overlay">
      <div class="toast-container">
        <For each={toasts()}>
          {(toast) => (
            <div class={`toast-msg ${toast.type}`}>
              <i
                class={`ph-fill ${
                  toast.type === "error"
                    ? "ph-warning-circle"
                    : toast.type === "success"
                      ? "ph-check-circle"
                      : "ph-info"
                }`}
              ></i>
              <span>{toast.message}</span>
            </div>
          )}
        </For>
      </div>

      {/* 1. Live Download / Installation Progress Banner */}
      <Show when={isUpdating()}>
        <div class="engine-update-banner-container">
          <div class="engine-update-card updating-active">
            <div class="update-icon-circle spinning">
              <i class="ph-bold ph-arrow-clockwise"></i>
            </div>
            <div class="update-card-body">
              <div class="update-card-title">
                {appUpdateDownloading()
                  ? "Downloading ViveStream-Next Update"
                  : "Updating Core Engines"}
              </div>
              <div class="update-card-desc">{currentMsg()}</div>
              <div class="update-progress-track">
                <div
                  class="update-progress-fill"
                  style={{ width: `${Math.max(4, Math.min(100, currentProgress()))}%` }}
                ></div>
              </div>
              <div class="update-progress-stats">
                <span>{currentProgress().toFixed(1)}%</span>
                <Show when={updateProgress()?.total_mb && (updateProgress()?.total_mb ?? 0) > 0}>
                  <span>
                    {updateProgress()?.downloaded_mb.toFixed(1)} /{" "}
                    {updateProgress()?.total_mb.toFixed(1)} MB
                  </span>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* 2. New App Version Available Notification */}
      <Show when={!isUpdating() && appUpdateInfo()?.update_available}>
        <div class="engine-update-banner-container">
          <div class="engine-update-card app-update-ready-card">
            <div class="update-icon-circle app-badge">
              <i class="ph-bold ph-sparkle"></i>
            </div>
            <div class="update-card-body">
              <div class="update-card-title">
                ViveStream-Next {appUpdateInfo()?.latest_version} Available
              </div>
              <div class="update-card-desc">
                A new version is available. Click to download and install automatically.
              </div>
            </div>
            <div class="update-card-actions">
              <button
                type="button"
                class="update-action-btn primary"
                onClick={() => installAppUpdate()}
                title="Download and install update"
              >
                <i class="ph-bold ph-download-simple"></i> Update Now
              </button>
              <button
                type="button"
                class="update-action-btn secondary"
                onClick={() => setAppUpdateInfo(null)}
                title="Dismiss update notification"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 3. Core Engines Updated & Restart Ready */}
      <Show when={!isUpdating() && engineUpdateReady()}>
        <div class="engine-update-banner-container">
          <div class="engine-update-card">
            <div class="update-icon-circle">
              <i class="ph-bold ph-arrows-clockwise"></i>
            </div>
            <div class="update-card-body">
              <div class="update-card-title">Core Engines Updated</div>
              <div class="update-card-desc">
                Latest yt-dlp & stream engines installed. Restart ViveStream to apply updates.
              </div>
            </div>
            <div class="update-card-actions">
              <button
                type="button"
                class="update-action-btn primary"
                onClick={restartApp}
                title="Restart ViveStream Now"
              >
                <i class="ph-bold ph-power"></i> Restart Now
              </button>
              <button
                type="button"
                class="update-action-btn secondary"
                onClick={() => setEngineUpdateReady(false)}
                title="Dismiss and restart later"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={dialogState()}>
        <div class="dialog-backdrop">
          <div class="dialog-box">
            <h3 class={`dialog-title ${dialogState()?.type}`}>
              <i
                class={`ph-fill ${
                  dialogState()?.type === "warning" ||
                  dialogState()?.type === "error"
                    ? "ph-warning"
                    : "ph-info"
                }`}
              ></i>
              {dialogState()?.title}
            </h3>
            <p class="dialog-message">{dialogState()?.message}</p>
            <div class="dialog-actions">
              <button
                class="dialog-btn cancel"
                onClick={() => closeDialog(false)}
              >
                Cancel
              </button>
              <button
                class="dialog-btn confirm"
                onClick={() => closeDialog(true)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
