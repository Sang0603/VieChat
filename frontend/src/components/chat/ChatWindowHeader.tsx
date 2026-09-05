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
import { ShieldBan, UserPlus, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId, typingUsers } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const blockedFriendIds = useFriendStore((s) => s.blockedFriendIds);
  const friends = useFriendStore((s) => s.friends);
  const sentList = useFriendStore((s) => s.sentList);
  const addFriend = useFriendStore((s) => s.addFriend);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);

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

  const isFriend = Boolean(otherUser) && friends.some((f) => f._id === otherUser!._id);
  const isStranger =
    chat.type === "direct" && Boolean(otherUser) && !isBlocked && !isFriend;
  const isRequestSent = Boolean(
    otherUser && sentList.some((r: any) => (r.to?._id ?? r.to) === otherUser!._id)
  );

  const handleSendFriendRequest = async () => {
    if (!otherUser || sendingRequest) return;

    setSendingRequest(true);
    try {
      const msg = await addFriend(otherUser._id);
      toast.success(msg);
    } catch (error: any) {
      // 🔧 FIX: addFriend giờ throw khi thất bại, cần try/catch ở đây để
      // báo lỗi đúng thay vì để lỗi rơi mất, không có phản hồi gì cho người dùng
      toast.error(error?.message ?? "Lỗi xảy ra khi gửi lời mời kết bạn");
    } finally {
      setSendingRequest(false);
    }
  };

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
              {isStranger && (
                <p className="text-xs text-muted-foreground truncate">Người lạ</p>
              )}
              {isTyping && !isBlocked && !isStranger && (
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

      {isStranger && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-t border-border/50 text-sm">
          <UserPlus className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground truncate">
            {isRequestSent
              ? "Đã gửi lời mời kết bạn tới người này"
              : "Gửi yêu cầu kết bạn tới người này"}
          </span>
          {!isRequestSent && (
            <Button
              size="sm"
              onClick={handleSendFriendRequest}
              disabled={sendingRequest}
            >
              {sendingRequest ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Gửi kết bạn"
              )}
            </Button>
          )}
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