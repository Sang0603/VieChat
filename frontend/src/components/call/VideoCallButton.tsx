// src/components/call/VideoCallButton.tsx
// Nút gọi video - đặt cạnh CallButton.tsx trong ChatWindowHeader.tsx

import { Video } from "lucide-react";
import { useStartCall } from "@/hooks/useStartCall";

interface VideoCallButtonProps {
  targetUserId: string;
  targetUserName: string;
  targetUserAvatar?: string | null;
  conversationId: string;
}

export default function VideoCallButton({
  targetUserId,
  targetUserName,
  targetUserAvatar,
  conversationId,
}: VideoCallButtonProps) {
  const { startCall, canCall } = useStartCall(conversationId);

  const handleCall = () => {
    startCall(
      {
        _id: targetUserId,
        displayName: targetUserName,
        avatarUrl: targetUserAvatar,
      },
      "video"
    );
  };

  return (
    <button
      onClick={handleCall}
      disabled={!canCall}
      className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-muted disabled:opacity-40"
      aria-label="Gọi video"
      title="Gọi video"
    >
      <Video className="h-5 w-5" />
    </button>
  );
}