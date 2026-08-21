// src/components/call/IncomingCallModal.tsx
// Khung nhỏ nổi Ở GIỮA màn hình, đồng bộ phong cách nhỏ gọn với CallWindow.tsx.
// Hiển thị đúng label "Cuộc gọi video đến" hoặc "Cuộc gọi thoại đến" theo callType.

import { Phone, Video } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";

interface IncomingCallModalProps {
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallModal({ onAccept, onReject }: IncomingCallModalProps) {
  const { status, peer, callType } = useCallStore();

  if (status !== "incoming" || !peer) return null;

  const isVideoCall = callType === "video";
  const label = isVideoCall ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[300px] overflow-hidden rounded-xl bg-neutral-900 shadow-2xl ring-1 ring-white/10">
        {/* Thanh tiêu đề */}
        <div className="bg-neutral-950 px-3 py-2">
          <span className="text-xs font-medium text-white/80">{label}</span>
        </div>

        {/* Nội dung: avatar + trạng thái */}
        <div className="relative flex flex-col items-center gap-3 px-4 py-6">
          {/* Nền mờ nhẹ từ avatar */}
          {peer.avatarUrl && (
            <div
              className="absolute inset-0 scale-110 bg-cover bg-center opacity-30 blur-xl"
              style={{ backgroundImage: `url(${peer.avatarUrl})` }}
            />
          )}

          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="relative h-20 w-20 overflow-hidden rounded-full ring-2 ring-white/20 shadow-lg">
              {peer.avatarUrl ? (
                <img src={peer.avatarUrl} alt={peer.displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-semibold text-white">
                  {peer.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {isVideoCall && (
                <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary ring-2 ring-neutral-900">
                  <Video className="h-3 w-3 text-white" />
                </div>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-sm font-semibold text-white">{peer.displayName}</h2>
              <p className="mt-0.5 text-xs text-white/70">{label} ...</p>
            </div>
          </div>
        </div>

        {/* Thanh điều khiển */}
        <div className="flex items-center justify-center gap-10 bg-black/40 py-3">
          <button
            onClick={onReject}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
            aria-label="Từ chối"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" fill="currentColor" strokeWidth={0} />
          </button>
          <button
            onClick={onAccept}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition hover:bg-green-700 animate-pulse"
            aria-label="Chấp nhận"
          >
            {isVideoCall ? <Video className="h-4 w-4" fill="currentColor" strokeWidth={0} /> : <Phone className="h-4 w-4" fill="currentColor" strokeWidth={0} />}
          </button>
        </div>
      </div>
    </div>
  );
}