// src/hooks/useStartCall.ts
// Logic bắt đầu 1 cuộc gọi thoại/video, tách ra từ CallButton.tsx
// để tái sử dụng ở nhiều nơi (nút gọi trên header, nút "Gọi lại" trong khung chat, v.v.)

import { useCallback } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useCallStore } from "@/stores/useCallStore";

export interface CallTargetUser {
  _id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export function useStartCall(conversationId: string) {
  const currentUser = useAuthStore((s) => s.user);
  const socket = useSocketStore((s) => s.socket);
  const status = useCallStore((s) => s.status);
  const startOutgoingCall = useCallStore((s) => s.startOutgoingCall);

  const startCall = useCallback(
    (target: CallTargetUser, callType: "audio" | "video" = "audio") => {
      if (!currentUser || !socket || status !== "idle") return;

      const callId = [currentUser._id, target._id].sort().join(":");

      startOutgoingCall({
        callId,
        conversationId,
        callType,
        peer: {
          _id: target._id,
          displayName: target.displayName,
          avatarUrl: target.avatarUrl,
        },
      });

      socket.emit("call:invite", {
        toUserId: target._id,
        conversationId,
        callType,
        fromUser: {
          _id: currentUser._id,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
        },
      });
    },
    [currentUser, socket, status, conversationId, startOutgoingCall]
  );

  const canCall = status === "idle" && !!socket;

  return { startCall, canCall };
}