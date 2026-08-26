import { useState } from "react";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import { Separator } from "../ui/separator";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import CallButton from "../call/CallButton";
import VideoCallButton from "../call/VideoCallButton";
import FriendProfileDialog from "./FriendProfileDialog";

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId, typingUsers } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const [profileOpen, setProfileOpen] = useState(false);

  let otherUser: Conversation["participants"][number] | null | undefined;

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  if (!chat) {
    return (
      <header className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2 w-full">
        <SidebarTrigger className="-ml-1 text-foreground" />
      </header>
    );
  }

  if (chat.type === "direct") {
    const otherUsers = chat.participants.filter((p) => p._id !== user?._id);
    otherUser = otherUsers.length > 0 ? otherUsers[0] : null;

    if (!user || !otherUser) return;
  }

  // 👇 MỚI THÊM: danh sách người đang gõ trong conversation này, trừ chính mình
  // (thực ra server đã tự loại trừ mình qua socket.to(), nhưng lọc lại cho chắc)
  const currentTypers = (typingUsers[chat._id] ?? []).filter(
    (t) => t.userId !== user?._id
  );
  const isTyping = currentTypers.length > 0;

  // 👇 MỚI THÊM: build text hiển thị - direct chat chỉ có 1 người nên luôn là
  // "Đang nhập...", group chat thì show tên (hoặc "X người đang nhập..." nếu nhiều)
  const getTypingText = () => {
    if (chat!.type === "direct") return "Đang nhập...";

    if (currentTypers.length === 1) {
      return `${currentTypers[0].displayName ?? "Ai đó"} đang nhập...`;
    }

    return "Nhiều người đang nhập...";
  };

  return (
    <header className="sticky top-0 z-10 px-4 py-2 flex items-center bg-background">
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => {
            if (chat?.type === "direct" && otherUser) setProfileOpen(true);
          }}
          disabled={chat.type !== "direct"}
          className={`flex items-center gap-3 min-w-0 ${
            chat.type === "direct" ? "cursor-pointer" : "cursor-default"
          }`}
        >
          {/* avatar */}
          <div className="relative">
            {chat.type === "direct" ? (
              <>
                <UserAvatar
                  type={"sidebar"}
                  name={otherUser?.displayName || "Moji"}
                  avatarUrl={otherUser?.avatarUrl || undefined}
                />
                <StatusBadge
                  status={
                    onlineUsers.includes(otherUser?._id ?? "") ? "online" : "offline"
                  }
                />
              </>
            ) : (
              <GroupChatAvatar
                participants={chat.participants}
                type="sidebar"
              />
            )}
          </div>

          {/* name + typing indicator */}
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground truncate">
              {chat.type === "direct" ? otherUser?.displayName : chat.group?.name}
            </h2>
            {/* 👇 MỚI THÊM */}
            {isTyping && (
              <p className="text-xs text-primary truncate animate-pulse">
                {getTypingText()}
              </p>
            )}
          </div>
        </button>

        {/* nút gọi thoại + gọi video + nút mở panel - chỉ hiện với chat 1-1, chưa hỗ trợ gọi nhóm */}
        <div className="ml-auto flex items-center gap-1">
          {chat.type === "direct" && otherUser && (
            <>
              <CallButton
                targetUserId={otherUser._id}
                targetUserName={otherUser.displayName}
                targetUserAvatar={otherUser.avatarUrl}
                conversationId={chat._id}
              />
              <VideoCallButton
                targetUserId={otherUser._id}
                targetUserName={otherUser.displayName}
                targetUserAvatar={otherUser.avatarUrl}
                conversationId={chat._id}
              />
            </>
          )}
          <Separator
            orientation="vertical"
            className="mx-1 data-[orientation=vertical]:h-4"
          />
          <SidebarTrigger className="text-foreground" />
        </div>
      </div>

      {chat.type === "direct" && otherUser && (
        <FriendProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          friendId={otherUser._id}
        />
      )}
    </header>
  );
};

export default ChatWindowHeader;