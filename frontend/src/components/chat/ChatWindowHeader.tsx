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
import { useFriendStore } from "@/stores/useFriendStore";
import CallButton from "../call/CallButton";
import VideoCallButton from "../call/VideoCallButton";
import FriendProfileDialog from "./FriendProfileDialog";
import { ShieldBan } from "lucide-react";

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId, typingUsers } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const blockedFriendIds = useFriendStore((s) => s.blockedFriendIds);
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

  const isBlocked =
    chat.type === "direct" && otherUser ? blockedFriendIds.includes(otherUser._id) : false;

  const currentTypers = (typingUsers[chat._id] ?? []).filter(
    (t) => t.userId !== user?._id
  );
  const isTyping = currentTypers.length > 0;

  const getTypingText = () => {
    if (chat!.type === "direct") return "Đang nhập...";

    if (currentTypers.length === 1) {
      return `${currentTypers[0].displayName ?? "Ai đó"} đang nhập...`;
    }

    return "Nhiều người đang nhập...";
  };

  return (
    <header className="sticky top-0 z-10 flex flex-col bg-background">
      <div className="px-4 py-2 flex items-center">
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
            <div className="relative">
              {chat.type === "direct" ? (
                <>
                  <UserAvatar
                    type={"sidebar"}
                    name={otherUser?.displayName || "VieChat"}
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

            <div className="min-w-0">
              <h2 className="font-semibold text-foreground truncate">
                {chat.type === "direct" ? otherUser?.displayName : chat.group?.name}
              </h2>
              {isTyping && !isBlocked && (
                <p className="text-xs text-primary truncate animate-pulse">
                  {getTypingText()}
                </p>
              )}
            </div>
          </button>

          <div className="ml-auto flex items-center gap-1">
            {chat.type === "direct" && otherUser && !isBlocked && (
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
      </div>

      {isBlocked && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive text-xs border-t border-destructive/20">
          <ShieldBan className="size-3.5 shrink-0" />
          Bạn đã chặn người này. Gọi điện và nhắn tin sẽ không hoạt động.
        </div>
      )}

      {chat.type === "direct" && otherUser && (
        <FriendProfileDialog
          open={profileOpen}
          onOpenChange={setProfileOpen}
          friendId={otherUser._id}
          onBlock={(friendId) => useFriendStore.getState().blockFriend(friendId)}
          onUnfriend={(friendId) => useFriendStore.getState().unfriend(friendId)}
        />
      )}
    </header>
  );
};

export default ChatWindowHeader;