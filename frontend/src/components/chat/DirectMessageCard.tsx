import { useState } from "react";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { cn } from "@/lib/utils";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import UnreadCountBadge from "./UnreadCountBadge";
import { useSocketStore } from "@/stores/useSocketStore";
import { useFriendStore } from "@/stores/useFriendStore";
import FriendProfileDialog from "./FriendProfileDialog";
import { useStartCall } from "@/hooks/useStartCall"; // 👈 MỚI THÊM

const DirectMessageCard = ({ convo }: { convo: Conversation }) => {
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
    hideConversation,
  } = useChatStore();
  const { onlineUsers } = useSocketStore();

  // dialog xem thông tin bạn bè khi bấm vào avatar — tách riêng khỏi việc
  // chọn hội thoại (onSelect của ChatCard) nên phải stopPropagation.
  const [profileOpen, setProfileOpen] = useState(false);

  // 👇 MỚI THÊM: đã có sẵn conversationId (convo._id) nên gọi thẳng, không
  // cần tạo conversation như trường hợp FriendWithoutConvoCard
  const { startCall } = useStartCall(convo._id);

  if (!user) return null;

  const otherUser = convo.participants.find((p) => p._id !== user._id);
  if (!otherUser) return null;

  const unreadCount = convo.unreadCounts[user._id];
  const lastMessage = convo.lastMessage?.content ?? "";

  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);
    if (!messages[id]) {
      await fetchMessages();
    }
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    // chặn không cho sự kiện click nổi lên ChatCard (sẽ trigger chọn hội
    // thoại), vì bấm avatar chỉ nhằm mở thông tin, không phải để mở chat.
    e.stopPropagation();
    setProfileOpen(true);
  };

  // 🆕 MỚI THÊM: xóa đoạn chat khỏi sidebar phía mình (không xóa phía bạn kia)
  const handleDeleteConversation = (id: string) => {
    hideConversation(id).catch(() => {
      // lỗi đã log trong store, ở đây chỉ chặn không cho crash UI
    });
  };

  // 👇 MỚI THÊM: bấm "Gọi điện" trong FriendProfileDialog
  // 🔧 FIX: thiếu đóng dialog thông tin tài khoản trước khi bắt đầu gọi,
  // khiến dialog che mất CallWindow (giao diện gọi) phía sau -> người
  // dùng chỉ thấy dialog đứng yên, tưởng bấm "Gọi điện" không có tác dụng
  // dù cuộc gọi thực ra đã bắt đầu chạy ngầm phía sau.
  const handleCall = () => {
    setProfileOpen(false);
    startCall(
      {
        _id: otherUser._id,
        displayName: otherUser.displayName ?? "",
        avatarUrl: otherUser.avatarUrl,
      },
      "audio"
    );
  };

  return (
    <>
      <ChatCard
        convoId={convo._id}
        name={otherUser.displayName ?? ""}
        timestamp={
          convo.lastMessage?.createdAt
            ? new Date(convo.lastMessage.createdAt)
            : undefined
        }
        isActive={activeConversationId === convo._id}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        unreadCount={unreadCount}
        leftSection={
          <>
            <button
              type="button"
              onClick={handleAvatarClick}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Xem thông tin ${otherUser.displayName ?? ""}`}
            >
              <UserAvatar
                type="sidebar"
                name={otherUser.displayName ?? ""}
                avatarUrl={otherUser.avatarUrl ?? undefined}
              />
            </button>
            <StatusBadge
              status={
                onlineUsers.includes(otherUser?._id ?? "") ? "online" : "offline"
              }
            />
            {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
          </>
        }
        subtitle={
          <p
            className={cn(
              "text-sm truncate",
              unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {lastMessage}
          </p>
        }
      />

      <FriendProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        friendId={otherUser._id}
        onCall={handleCall} // 👈 MỚI THÊM
        onMessage={() => {
          handleSelectConversation(convo._id);
          setProfileOpen(false);
        }}
        // 👇 MỚI THÊM: trước đây thiếu 2 dòng này -> bấm "Chặn tin nhắn và
        // cuộc gọi" / "Xóa khỏi danh sách bạn bè" từ avatar trong sidebar
        // không gọi API thật, dialog tự đóng như đã thành công (bug)
        onBlock={(friendId) => useFriendStore.getState().blockFriend(friendId)}
        onUnfriend={(friendId) => useFriendStore.getState().unfriend(friendId)}
      />
    </>
  );
};

export default DirectMessageCard;