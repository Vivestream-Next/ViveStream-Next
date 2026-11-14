import { createSignal, onMount, createMemo, createEffect } from "solid-js";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useParams, useNavigate } from "@solidjs/router";
import { open } from "@tauri-apps/plugin-dialog";
import VideoCard from "../components/VideoCard";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import PremiumPlaceholder from "../components/PremiumPlaceholder";
import VirtualGrid from "../components/VirtualGrid";
import {
  VideoEntry,
  addToast,
  artistVideosSortBy,
  artistVideosSortDirection,
  artistVideosRandomSeed,
  getThumbnailUrl,
} from "../store";
import { sortVideos } from "../utils/sortUtils";
import { preloadImages } from "../utils/imageLoader";
import "./ArtistPage.css";

export default function ArtistPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [videos, setVideos] = createSignal<VideoEntry[]>([]);
  const [showAddToModal, setShowAddToModal] = createSignal(false);
  const [selectedVideoForAdd, setSelectedVideoForAdd] =
    createSignal<VideoEntry | null>(null);
  const [avatarTimestamp, setAvatarTimestamp] = createSignal<number>(
    Date.now(),
  );

  const artistName = () => {
    try {
      return decodeURIComponent(params.name || "");
    } catch {
      return params.name || "";
    }
  };

  const fetchVideos = async () => {
    const name = artistName();
    if (!name) return;
    try {
      const data = await invoke<VideoEntry[]>("get_videos_by_artist", {
        name: name,
      });
      setVideos(data);
    } catch (e) {
      console.error("Failed to load artist videos:", e);
    }
  };

  onMount(async () => {
    await fetchVideos();
  });

  const handleAvatarUpload = async () => {
    const name = artistName();
    if (!name) return;
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpeg", "jpg", "webp"],
        },
      ],
    });

    if (selected && typeof selected === "string") {
      try {
        await invoke("upload_artist_avatar", {
          name: name,
          imagePath: selected,
        });

        setAvatarTimestamp(Date.now());
        await fetchVideos();
        addToast("Artist avatar updated!", "success");
      } catch (e) {
        console.error("Failed to upload avatar", e);
        addToast("Failed to upload avatar", "error");
      }
    }
  };

  const getArtistAvatarSrc = () => {
    return `http://127.0.0.1:1422/Avatars/${encodeURIComponent(
      artistName(),
    )}.jpg?t=${avatarTimestamp()}`;
  };

  const getArtistBackdropSrc = () => {
    if (videos().length > 0 && videos()[0].thumbnail_path) {
      return convertFileSrc(videos()[0].thumbnail_path);
    }
    return getArtistAvatarSrc();
  };

  const displayedVideos = createMemo(() => {
    return sortVideos(
      videos(),
      artistVideosSortBy(),
      artistVideosSortDirection(),
      artistVideosRandomSeed(),
    );
  });

  createEffect(() => {
    const list = displayedVideos();
    if (list.length > 0) {
      const urls = list.map((v) => getThumbnailUrl(v));
      preloadImages(urls);
    }
  });

  const playAll = () => {
    const vids = displayedVideos();
    if (vids.length > 0) {
      navigate(
        `/player/${vids[0].id}?context=artist&name=${encodeURIComponent(artistName())}`,
      );
    }
  };

  return (
    <div class="page-wrapper artist-page">
      <AddToPlaylistModal
        isOpen={showAddToModal()}
        videoId={selectedVideoForAdd()?.id || null}
        videoTitle={selectedVideoForAdd()?.title}
        onClose={() => {
          setShowAddToModal(false);
          setSelectedVideoForAdd(null);
        }}
      />

      {/* Hero Banner Header */}
      <div class="artist-hero">
        <img
          src={getArtistBackdropSrc()}
          class="artist-hero-backdrop"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div class="artist-hero-gradient"></div>

        <div class="artist-hero-content">
          <div class="artist-hero-top-nav">
            <button
              class="artist-hero-icon-btn"
              onClick={() => navigate(-1)}
              title="Back to Artists"
            >
              <i class="ph ph-arrow-left"></i>
            </button>
          </div>

          <div class="artist-hero-main">
            <div class="artist-hero-avatar-container">
              <img
                src={getArtistAvatarSrc()}
                class="artist-hero-avatar"
                onError={(e) => {
                  if (videos().length > 0 && videos()[0].avatar_path) {
                    e.currentTarget.src = convertFileSrc(
                      videos()[0].avatar_path,
                    );
                  } else {
                    e.currentTarget.src = "";
                    e.currentTarget.className =
                      "ph-fill ph-user artist-hero-avatar placeholder";
                  }
                }}
              />
              <button
                class="artist-hero-avatar-upload"
                onClick={handleAvatarUpload}
                title="Change Avatar"
              >
                <i class="ph-fill ph-camera"></i>
              </button>
            </div>

            <div class="artist-hero-info">
              <span class="artist-hero-tag">Artist</span>
              <h1 class="artist-hero-title">{artistName()}</h1>

              <div class="artist-hero-stats">
                <span>
                  <i class="ph ph-film-strip"></i> {videos().length} Video
                  {videos().length !== 1 ? "s" : ""}
                </span>
              </div>

              <div class="artist-hero-actions">
                <button
                  class="play-all-btn primary-btn"
                  onClick={playAll}
                  disabled={videos().length === 0}
                >
                  <i class="ph-fill ph-play"></i> Play All
                </button>
                <button class="secondary-btn" onClick={handleAvatarUpload}>
                  <i class="ph ph-upload"></i> Upload Avatar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {videos().length === 0 ? (
        <PremiumPlaceholder
          title="No Videos Found"
          subtitle={`No downloaded videos found for artist "${artistName()}".`}
          iconName="microphone-stage"
        />
      ) : (
        <VirtualGrid
          items={displayedVideos()}
          minItemWidth={340}
          gap={16}
          estimatedItemHeight={285}
          overscan={2}
          renderItem={(video) => (
            <VideoCard
              video={video}
              showAvatar={false}
              onClick={() =>
                navigate(
                  `/player/${video.id}?context=artist&name=${encodeURIComponent(
                    artistName(),
                  )}`,
                )
              }
              onAddToPlaylist={(v) => {
                setSelectedVideoForAdd(v);
                setShowAddToModal(true);
              }}
              onDelete={(v) => {
                setVideos((prev) => prev.filter((x) => x.id !== v.id));
              }}
            />
          )}
        />
      )}
    </div>
  );
}
