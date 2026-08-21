// src/components/call/CallWindow.tsx
// Khung cuộc gọi nổi ở giữa màn hình. Hỗ trợ cả audio và video call:
// - audio: hiển thị avatar tròn như cũ, chỉ phát âm thanh
// - video: hiển thị video remote toàn khung, video local nhỏ góc dưới-phải
//   (giống Zalo/Messenger), có thêm nút bật/tắt camera

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, Minus, X, Video, VideoOff } from "lucide-react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useCallStore } from "@/stores/useCallStore";
import { useWebRTC } from "@/hooks/useWebRTC";

export default function CallWindow() {
  const socket = useSocketStore((s) => s.socket);
  const {
    status,
    callId,
    callType,
    peer,
    isMuted,
    startedAt,
    setConnecting,
    setOngoing,
    toggleMute,
    endCall,
  } = useCallStore();

  const isVideoCall = callType === "video";

  // Thu nhỏ xuống thanh nhỏ (giống bấm nút "_" trên popup Zalo)
  const [isMinimized, setIsMinimized] = useState(false);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const pendingIceQueue = useRef<RTCIceCandidateInit[]>([]);

  const sendIceCandidate = useCallback(
    (candidate: RTCIceCandidateInit) => {
      if (!socket || !callId || !peer) return;
      socket.emit("call:ice-candidate", { callId, toUserId: peer._id, candidate });
    },
    [socket, callId, peer]
  );

  const {
    localStream,
    remoteStream,
    mediaError,
    isCameraOff,
    createOffer,
    createAnswer,
    acceptAnswer,
    addIceCandidate,
    toggleMute: toggleMicTrack,
    toggleCamera,
    cleanup,
  } = useWebRTC({ onIceCandidate: sendIceCandidate, callType });

  // gắn remote stream vào audio (mọi loại call) và video (nếu là video call)
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // gắn local stream vào video preview nhỏ (chỉ video call)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ---- Khi mình là NGƯỜI GỌI và vừa được accept -> tạo offer ----
  useEffect(() => {
    if (!socket || status !== "outgoing") return;

    const onAccepted = async ({ callId: acceptedCallId }: { callId: string }) => {
      if (acceptedCallId !== callId) return;
      setConnecting();
      try {
        const offer = await createOffer();
        socket.emit("call:offer", { callId, toUserId: peer?._id, sdp: offer });
      } catch (err) {
        console.error("[CallWindow] Lỗi khi tạo offer:", err);
      }
    };

    const onRejected = () => {
      cleanup();
      endCall();
    };

    socket.on("call:accepted", onAccepted);
    socket.on("call:rejected", onRejected);
    socket.on("call:unavailable", onRejected);
    socket.on("call:busy", onRejected);

    return () => {
      socket.off("call:accepted", onAccepted);
      socket.off("call:rejected", onRejected);
      socket.off("call:unavailable", onRejected);
      socket.off("call:busy", onRejected);
    };
  }, [socket, status, callId, peer, createOffer, setConnecting, cleanup, endCall]);

  // ---- Offer/answer/ICE/kết thúc cuộc gọi ----
  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ callId: incomingCallId, sdp, fromUserId }: any) => {
      if (incomingCallId !== callId) return;
      setConnecting();
      try {
        const answer = await createAnswer(sdp);
        socket.emit("call:answer", { callId, toUserId: fromUserId, sdp: answer });

        pendingIceQueue.current.forEach((c) => addIceCandidate(c));
        pendingIceQueue.current = [];

        setOngoing();
      } catch (err) {
        console.error("[CallWindow] Lỗi khi tạo answer:", err);
      }
    };

    const onAnswer = async ({ callId: answeredCallId, sdp }: any) => {
      if (answeredCallId !== callId) return;
      try {
        await acceptAnswer(sdp);
        pendingIceQueue.current.forEach((c) => addIceCandidate(c));
        pendingIceQueue.current = [];
        setOngoing();
      } catch (err) {
        console.error("[CallWindow] Lỗi khi accept answer:", err);
      }
    };

    const onIceCandidate = ({ callId: iceCallId, candidate }: any) => {
      if (iceCallId !== callId) return;
      addIceCandidate(candidate);
    };

    const onEnded = () => {
      cleanup();
      endCall();
    };

    socket.on("call:offer", onOffer);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice-candidate", onIceCandidate);
    socket.on("call:ended", onEnded);
    socket.on("call:cancelled", onEnded);

    return () => {
      socket.off("call:offer", onOffer);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice-candidate", onIceCandidate);
      socket.off("call:ended", onEnded);
      socket.off("call:cancelled", onEnded);
    };
  }, [socket, callId, createAnswer, acceptAnswer, addIceCandidate, setConnecting, setOngoing, cleanup, endCall]);

  // Reset trạng thái thu nhỏ mỗi khi bắt đầu 1 cuộc gọi mới
  useEffect(() => {
    if (status === "idle") setIsMinimized(false);
  }, [status]);

  const handleHangUp = () => {
    if (socket && callId) socket.emit("call:end", { callId });
    cleanup();
    endCall();
  };

  const handleToggleMute = () => {
    toggleMicTrack(!isMuted);
    toggleMute();
  };

  const handleToggleCamera = () => {
    toggleCamera(!isCameraOff);
  };

  if (status === "idle" || status === "incoming" || !peer) return null;

  const statusText =
    status === "outgoing"
      ? "Đang đổ chuông ..."
      : status === "connecting"
      ? "Đang kết nối ..."
      : null; // "ongoing" hiển thị timer riêng bên dưới

  // ---- Chế độ thu nhỏ: chỉ còn 1 thanh nhỏ ở góc màn hình ----
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full bg-neutral-900 px-4 py-2.5 text-white shadow-2xl ring-1 ring-white/10 transition hover:bg-neutral-800"
      >
        <div className="h-8 w-8 overflow-hidden rounded-full">
          {peer.avatarUrl ? (
            <img src={peer.avatarUrl} alt={peer.displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary text-sm font-semibold">
              {peer.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <span className="text-sm font-medium">
          {statusText ?? <CallTimer startedAt={startedAt} />}
        </span>
        <audio ref={remoteAudioRef} autoPlay playsInline />
      </button>
    );
  }

  // ---- Kích thước khung: video call to hơn để đủ chỗ hiển thị hình ----
  const windowWidth = isVideoCall ? "w-[420px]" : "w-[300px]";

  // ---- Khung gọi nổi GIỮA màn hình ----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`${windowWidth} overflow-hidden rounded-xl bg-neutral-900 shadow-2xl ring-1 ring-white/10`}>
        {/* Thanh tiêu đề */}
        <div className="flex items-center justify-between bg-neutral-950 px-3 py-2">
          <span className="truncate text-xs font-medium text-white/80">
            {isVideoCall ? "Cuộc gọi video" : "Cuộc gọi thoại"} - {peer.displayName}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="flex h-6 w-6 items-center justify-center rounded text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Thu nhỏ"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={handleHangUp}
              className="flex h-6 w-6 items-center justify-center rounded text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isVideoCall ? (
          // ================= GIAO DIỆN VIDEO CALL =================
          <div className="relative aspect-[4/3] w-full bg-black">
            {/* Video remote - toàn khung */}
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-white/20">
                  {peer.avatarUrl ? (
                    <img src={peer.avatarUrl} alt={peer.displayName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary text-xl font-semibold text-white">
                      {peer.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="text-xs text-white/70">
                  {statusText}
                  {status === "ongoing" && <CallTimer startedAt={startedAt} />}
                </p>
              </div>
            )}

            {/* Video local - góc dưới-phải, nhỏ, giống Zalo */}
            <div className="absolute bottom-3 right-3 h-24 w-20 overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-white/20 shadow-lg">
              {localStream && !isCameraOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover [transform:scaleX(-1)]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <VideoOff className="h-5 w-5 text-white/40" />
                </div>
              )}
            </div>

            {/* Timer nổi trên video khi đang ongoing */}
            {status === "ongoing" && remoteStream && (
              <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
                <CallTimer startedAt={startedAt} />
              </div>
            )}

            {mediaError && (
              <div className="absolute inset-x-3 top-3 rounded bg-red-500/90 px-2 py-1 text-center text-xs text-white">
                {mediaError}
              </div>
            )}

            <audio ref={remoteAudioRef} autoPlay playsInline />
          </div>
        ) : (
          // ================= GIAO DIỆN AUDIO CALL (giữ nguyên như cũ) =================
          <div className="relative flex flex-col items-center gap-3 px-4 py-6">
            {peer.avatarUrl && (
              <div
                className="absolute inset-0 scale-110 bg-cover bg-center opacity-30 blur-xl"
                style={{ backgroundImage: `url(${peer.avatarUrl})` }}
              />
            )}

            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-white/20 shadow-lg">
                {peer.avatarUrl ? (
                  <img src={peer.avatarUrl} alt={peer.displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-semibold text-white">
                    {peer.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="text-center">
                <h2 className="text-sm font-semibold text-white">{peer.displayName}</h2>
                <p className="mt-0.5 text-xs text-white/70">
                  {statusText}
                  {status === "ongoing" && <CallTimer startedAt={startedAt} />}
                </p>
              </div>

              {mediaError && (
                <p className="max-w-[220px] text-center text-xs text-red-400">{mediaError}</p>
              )}

              <audio ref={remoteAudioRef} autoPlay playsInline />
            </div>
          </div>
        )}

        {/* Thanh điều khiển */}
        <div className="flex items-center justify-center gap-6 bg-black/40 py-3">
          <button
            onClick={handleToggleMute}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            aria-label={isMuted ? "Bật mic" : "Tắt mic"}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {isVideoCall && (
            <button
              onClick={handleToggleCamera}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              aria-label={isCameraOff ? "Bật camera" : "Tắt camera"}
            >
              {isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={handleHangUp}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
            aria-label="Kết thúc cuộc gọi"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" fill="currentColor" strokeWidth={0} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: number | null }) {
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      if (displayRef.current) displayRef.current.textContent = `${mm}:${ss}`;
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span ref={displayRef}>00:00</span>;
}