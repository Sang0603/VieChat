// src/components/call/GroupCallManager.tsx
// Mount 1 lần ở App.tsx (cùng chỗ với CallWindow / IncomingCallModal).

import { useEffect, useRef } from "react";
import { Phone, Video } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useCallStore } from "@/stores/useCallStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore";
import GroupCallWindow from "./GroupCallWindow";

export default function GroupCallManager() {
  const socket = useSocketStore((s) => s.socket);
  const status = useGroupCallStore((s) => s.status);

  // Lắng nghe cuộc gọi nhóm đến / kết thúc
  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: {
      conversationId: string;
      callType: "audio" | "video";
      groupName: string;
      fromUser: { displayName: string; avatarUrl?: string | null };
    }) => {
      // Đang bận (gọi 1-1 hoặc gọi nhóm khác) thì bỏ qua
      if (useCallStore.getState().status !== "idle") return;
      if (useGroupCallStore.getState().status !== "idle") return;

      useGroupCallStore.getState().receiveIncoming({
        conversationId: payload.conversationId,
        callType: payload.callType,
        groupName: payload.groupName,
        callerName: payload.fromUser.displayName,
        callerAvatar: payload.fromUser.avatarUrl,
      });
    };

    const onEnded = ({ conversationId }: { conversationId: string }) => {
      const s = useGroupCallStore.getState();
      if (s.status === "incoming" && s.conversationId === conversationId) {
        s.endCall();
      }
    };

    socket.on("group-call:incoming", onIncoming);
    socket.on("group-call:ended", onEnded);

    return () => {
      socket.off("group-call:incoming", onIncoming);
      socket.off("group-call:ended", onEnded);
    };
  }, [socket]);

  if (status === "incoming") return <GroupIncomingModal />;
  if (status === "active") return <GroupCallWindow />;
  return null;
}

function GroupIncomingModal() {
  const { callType, groupName, callerName, callerAvatar, acceptIncoming, endCall } =
    useGroupCallStore();

  const isVideo = callType === "video";
  const label = isVideo ? "Cuộc gọi video nhóm" : "Cuộc gọi thoại nhóm";

  // Nhạc chuông - dừng khi modal đóng (accept / reject / người gọi huỷ)
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/sounds/ringtone.mp3");
    audio.loop = true;
    audioRef.current = audio;
    audio.play().catch((err) => console.warn("Không thể tự phát nhạc chuông:", err));

    return () => {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[300px] overflow-hidden rounded-xl bg-neutral-900 shadow-2xl ring-1 ring-white/10">
        <div className="bg-neutral-950 px-3 py-2">
          <span className="text-xs font-medium text-white/80">{label}</span>
        </div>

        <div className="relative flex flex-col items-center gap-3 px-4 py-6">
          <div className="relative h-20 w-20 overflow-hidden rounded-full ring-2 ring-white/20 shadow-lg">
            {callerAvatar ? (
              <img src={callerAvatar} alt={callerName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-semibold text-white">
                {(callerName || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="text-center">
            <h2 className="text-sm font-semibold text-white">{groupName || "Nhóm chat"}</h2>
            <p className="mt-0.5 text-xs text-white/70">{callerName} đang gọi nhóm ...</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-10 bg-black/40 py-3">
          <button
            onClick={endCall}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
            aria-label="Từ chối"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" fill="currentColor" strokeWidth={0} />
          </button>
          <button
            onClick={acceptIncoming}
            className="flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition hover:bg-green-700"
            aria-label="Tham gia"
          >
            {isVideo ? (
              <Video className="h-4 w-4" fill="currentColor" strokeWidth={0} />
            ) : (
              <Phone className="h-4 w-4" fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}