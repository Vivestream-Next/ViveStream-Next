import { createSignal, createMemo, createEffect, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  VideoEntry,
  showConfirmDialog,
  addToast,
  favoritesSet,
  toggleFavoriteInCache,
  getThumbnailUrl,
  activeVideo,
  closeGlobalMiniplayer,
} from "../store";
import {
  isImageDecoded,
  markImageDecoded,
  isImageFailed,
  markImageFailed,
} from "../utils/imageLoader";
import "./VideoCard.css";

export interface VideoCardProps {
  video: VideoEntry;
  onClick?: () => void;
  showAvatar?: boolean;
  initialFavorite?: boolean;
  onToggleFavorite?: (id: string, isFav: boolean) => void;
  onDelete?: (video: VideoEntry) => void;
  onAddToPlaylist?: (video: VideoEntry) => void;
  onRemoveFromPlaylist?: (video: VideoEntry) => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  style?: string;
}

export default function VideoCard(props: VideoCardProps) {
  const isFavorite = createMemo(() => {
    if (props.initialFavorite !== undefined) return props.initialFavorite;
    return favoritesSet().has(props.video.id);
  });
  const [isDeleting, setIsDeleting] = createSignal(false);

  const thumbUrl = createMemo(() => getThumbnailUrl(props.video));
  const [thumbLoaded, setThumbLoaded] = createSignal(
    isImageDecoded(thumbUrl()),
  );
  const navigate = useNavigate();

  createEffect(() => {
    const url = thumbUrl();
    setThumbLoaded(isImageDecoded(url));
  });

  const avatarUrl = createMemo(() => {
    if (props.video.avatar_path) {
      return convertFileSrc(props.video.avatar_path);
    }
    return `http://127.0.0.1:1422/Avatars/${encodeURIComponent(props.video.channel)}.jpg`;
  });
  const [avatarHidden, setAvatarHidden] = createSignal(
    isImageFailed(avatarUrl()),
  );

  createEffect(() => {
    const url = avatarUrl();
    setAvatarHidden(isImageFailed(url));
  });

  const handleToggleFavorite = async (e: MouseEvent) => {
    e.stopPropagation();
    const newStatus = !isFavorite();
    try {
      await invoke("toggle_favorite", {
        id: props.video.id,
        isFavorite: newStatus,
      });
      toggleFavoriteInCache(props.video.id, newStatus);
      props.onToggleFavorite?.(props.video.id, newStatus);
      addToast(
        newStatus ? "Added to Favourites" : "Removed from Favourites",
        newStatus ? "success" : "info",
      );
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      addToast("Failed to update favourite status", "error");
    }
  };

  const handleAddToPlaylist = (e: MouseEvent) => {
    e.stopPropagation();
    props.onAddToPlaylist?.(props.video);
  };

  const handleRemoveFromPlaylist = (e: MouseEvent) => {
    e.stopPropagation();
    props.onRemoveFromPlaylist?.(props.video);
  };

  const handleDelete = async (e: MouseEvent) => {
    e.stopPropagation();
    if (isDeleting()) return;

    const confirmed = await showConfirmDialog(
      `Are you sure you want to permanently delete "${props.video.title}" from your library?`,
      "Delete Video",
      "warning",
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      if (activeVideo()?.id === props.video.id) {
        closeGlobalMiniplayer();
      }
      await invoke("delete_video", { videoId: props.video.id });
      addToast("Video deleted permanently", "info");
      props.onDelete?.(props.video);
    } catch (err) {
      console.error("Failed to delete video:", err);
      addToast(`Failed to delete video: ${err}`, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      class="video-card"
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onClick={props.onClick}
      style={props.style}
    >
      <div class="video-thumbnail-container">
        <img
          src={thumbUrl()}
          alt={props.video.title}
          class={`video-thumbnail ${thumbLoaded() || isImageDecoded(thumbUrl()) ? "loaded" : ""}`}
          loading="lazy"
          decoding="async"
          onLoad={() => {
            markImageDecoded(thumbUrl());
            setThumbLoaded(true);
          }}
        />
      </div>

      <div class="video-info">
        <h3 class="video-title" title={props.video.title}>
          {props.video.title}
        </h3>
        <div class="video-meta-row">
          <div class="video-channel-group">
            <Show when={props.showAvatar !== false && !avatarHidden()}>
              <img
                src={avatarUrl()}
                onError={() => {
                  markImageFailed(avatarUrl());
                  setAvatarHidden(true);
                }}
                onLoad={() => {
                  markImageDecoded(avatarUrl());
                }}
                class="avatar-small"
                loading="lazy"
                decoding="async"
              />
            </Show>
            <p class="video-channel" title={props.video.channel}>
              {props.video.channel}
            </p>
          </div>

          <div
            class="video-card-actions"
            role="toolbar"
            aria-label="Media card actions"
          >
            {/* Favorite Button */}
            <button
              type="button"
              class={`card-action-btn fav-btn ${isFavorite() ? "is-fav" : ""}`}
              onClick={handleToggleFavorite}
              title={
                isFavorite() ? "Remove from Favourites" : "Add to Favourites"
              }
              aria-label={
                isFavorite() ? "Remove from Favourites" : "Add to Favourites"
              }
            >
              <i
                class={`ph-fill ph-heart ${isFavorite() ? "fav-pulse" : ""}`}
                aria-hidden="true"
              ></i>
            </button>

            {/* Open in Lyrics Studio Button */}
            <button
              type="button"
              class="card-action-btn lyrics-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/lyrics?trackId=${props.video.id}`);
              }}
              title="Open in Lyrics Studio"
              aria-label="Open in Lyrics Studio"
            >
              <i class="ph-bold ph-waveform" aria-hidden="true"></i>
            </button>

            {/* Add to Playlist Button */}
            <Show when={props.onAddToPlaylist}>
              <button
                type="button"
                class="card-action-btn playlist-btn"
                onClick={handleAddToPlaylist}
                title="Add to Playlist"
                aria-label="Add to Playlist"
              >
                <i class="ph-fill ph-list-plus" aria-hidden="true"></i>
              </button>
            </Show>

            {/* Remove from Playlist Button */}
            <Show when={props.onRemoveFromPlaylist}>
              <button
                type="button"
                class="card-action-btn remove-pl-btn"
                onClick={handleRemoveFromPlaylist}
                title="Remove from this Playlist"
                aria-label="Remove from this Playlist"
              >
                <i class="ph-fill ph-minus-circle" aria-hidden="true"></i>
              </button>
            </Show>

            {/* Delete Button */}
            <Show when={props.onDelete}>
              <button
                type="button"
                class="card-action-btn delete-btn"
                onClick={handleDelete}
                title="Delete permanently"
                aria-label="Delete video permanently"
              >
                <i class="ph-fill ph-trash" aria-hidden="true"></i>
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
