// src/components/call/GroupCallWindow.tsx
// Khung cuộc gọi nhóm: lưới các ô (mình + những người khác).

import { useEffect, useState } from "react";
import { useRef } from "react";
import { Mic, MicOff, Phone, Video, VideoOff } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useChatStore } from "@/stores/useChatStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import { useGroupWebRTC } from "@/hooks/useGroupWebRTC";

export default function GroupCallWindow() {
  const socket = useSocketStore((s) => s.socket);
  const conversations = useChatStore((s) => s.conversations);
  const { conversationId, callType, groupName, endCall } = useGroupCallStore();

  const isVideo = callType === "video";

  const {
    localStream,
    remoteStreams,
    mediaError,
    isMuted,
    isCameraOff,
    toggleMute,
    toggleCamera,
  } = useGroupWebRTC({ socket, conversationId: conversationId ?? "", callType });

  const chat = conversations.find((c) => c._id === conversationId);
  const findPerson = (id: string) => chat?.participants.find((p) => p._id === id);

  const remoteIds = Object.keys(remoteStreams);
  const total = 1 + remoteIds.length;
  const gridCols = total <= 1 ? "grid-cols-1" : total <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`${
          isVideo ? "w-[760px]" : "w-[440px]"
        } max-w-[95vw] overflow-hidden rounded-xl bg-neutral-900 shadow-2xl ring-1 ring-white/10`}
      >
        {/* Thanh tiêu đề */}
        <div className="flex items-center justify-between bg-neutral-950 px-3 py-2">
          <span className="truncate text-xs font-medium text-white/80">
            {isVideo ? "Gọi video nhóm" : "Gọi thoại nhóm"} - {groupName || chat?.group?.name}
          </span>
          <span className="text-xs text-white/70">
            {total} người · <CallTimer />
          </span>
        </div>

        {/* Lưới người tham gia */}
        <div className="relative bg-black p-2">
          <div className={`grid gap-2 ${gridCols}`}>
            <Tile
              stream={localStream}
              name="Bạn"
              avatarUrl={undefined}
              muted
              mirror
              showVideo={isVideo && !isCameraOff}
              compact={!isVideo}
            />
            {remoteIds.map((id) => {
              const p = findPerson(id);
              return (
                <Tile
                  key={id}
                  stream={remoteStreams[id]}
                  name={p?.displayName ?? "Thành viên"}
                  avatarUrl={p?.avatarUrl ?? undefined}
                  showVideo={isVideo}
                  compact={!isVideo}
                />
              );
            })}
          </div>

          {total === 1 && !mediaError && (
            <p className="mt-2 text-center text-xs text-white/60">
              Đang chờ mọi người tham gia ...
            </p>
          )}

          {mediaError && (
            <p className="mt-2 rounded bg-red-500/90 px-2 py-1 text-center text-xs text-white">
              {mediaError}
            </p>
          )}
        </div>

        {/* Thanh điều khiển */}
        <div className="flex items-center justify-center gap-6 bg-black/40 py-3">
          <button
            onClick={toggleMute}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            aria-label={isMuted ? "Bật mic" : "Tắt mic"}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {isVideo && (
            <button
              onClick={toggleCamera}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              aria-label={isCameraOff ? "Bật camera" : "Tắt camera"}
            >
              {isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={endCall}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
            aria-label="Rời cuộc gọi"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" fill="currentColor" strokeWidth={0} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface TileProps {
  stream: MediaStream | null;
  name: string;
  avatarUrl?: string;
  muted?: boolean;
  mirror?: boolean;
  showVideo: boolean;
  compact?: boolean;
}

function Tile({ stream, name, avatarUrl, muted = false, mirror = false, showVideo, compact }: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const displayVideo = showVideo && !!stream;

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-neutral-800 ${
        compact ? "h-28" : "aspect-video"
      }`}
    >
      {/* Luôn render <video> để âm thanh của người khác được phát, kể cả cuộc gọi thoại */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={
          displayVideo
            ? `h-full w-full object-cover ${mirror ? "[transform:scaleX(-1)]" : ""}`
            : "hidden"
        }
      />

      {!displayVideo && (
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-14 w-14 overflow-hidden rounded-full ring-2 ring-white/20">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary text-lg font-semibold text-white">
                {(name || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      )}

      <span className="absolute bottom-1.5 left-1.5 max-w-[80%] truncate rounded bg-black/50 px-1.5 py-0.5 text-[11px] text-white">
        {name}
      </span>
    </div>
  );
}

function CallTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return <span>{`${mm}:${ss}`}</span>;
}