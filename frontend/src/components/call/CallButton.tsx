// src/components/call/CallButton.tsx
// Nút gọi thoại - đặt trong ChatWindowHeader.tsx

import { Phone } from "lucide-react";
import { useStartCall } from "@/hooks/useStartCall";

interface CallButtonProps {
  targetUserId: string;
  targetUserName: string;
  targetUserAvatar?: string | null;
  conversationId: string;
}

export default function CallButton({
  targetUserId,
  targetUserName,
  targetUserAvatar,
  conversationId,
}: CallButtonProps) {
  const { startCall, canCall } = useStartCall(conversationId);

  const handleCall = () => {
    startCall(
      {
        _id: targetUserId,
        displayName: targetUserName,
        avatarUrl: targetUserAvatar,
      },
      "audio"
    );
  };

  return (
    <button
      onClick={handleCall}
      disabled={!canCall}
      className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-muted disabled:opacity-40"
      aria-label="Gọi thoại"
      title="Gọi thoại"
    >
      <Phone className="h-5 w-5" />
    </button>
  );
}