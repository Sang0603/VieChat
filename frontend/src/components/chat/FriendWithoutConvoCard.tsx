import { useState } from "react";
import type { Friend } from "@/types/user";
import ChatCard from "./ChatCard";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useFriendStore } from "@/stores/useFriendStore";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import FriendProfileDialog from "./FriendProfileDialog";

// 🆕 MỚI THÊM: card cho 1 người bạn CHƯA có conversation nào với mình.
// Bấm vào sẽ tự tạo conversation (backend tự dedupe nếu đã tồn tại), sau đó
// nó sẽ tự chuyển thành DirectMessageCard bình thường ở lần render tiếp theo.
const FriendWithoutConvoCard = ({ friend }: { friend: Friend }) => {
  const createConversation = useChatStore((s) => s.createConversation);
  const { onlineUsers } = useSocketStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSelect = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createConversation("direct", "", [friend._id]);
    } finally {
      setCreating(false);
    }
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setProfileOpen(true);
  };

  return (
    <>
      <ChatCard
        convoId={friend._id}
        name={friend.displayName ?? ""}
        timestamp={undefined}
        isActive={false}
        onSelect={handleSelect}
        onDelete={() => {}}
        unreadCount={0}
        leftSection={
          <>
            <button
              type="button"
              onClick={handleAvatarClick}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Xem thông tin ${friend.displayName ?? ""}`}
            >
              <UserAvatar
                type="sidebar"
                name={friend.displayName ?? ""}
                avatarUrl={friend.avatarUrl ?? undefined}
              />
            </button>
            <StatusBadge
              status={onlineUsers.includes(friend._id) ? "online" : "offline"}
            />
          </>
        }
        subtitle={
          <p className="text-sm truncate text-muted-foreground">
            Bắt đầu trò chuyện
          </p>
        }
      />

      <FriendProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        friendId={friend._id}
        onMessage={() => {
          handleSelect();
          setProfileOpen(false);
        }}
        onBlock={(friendId) => useFriendStore.getState().blockFriend(friendId)}
        onUnfriend={(friendId) => useFriendStore.getState().unfriend(friendId)}
      />
    </>
  );
};

export default FriendWithoutConvoCard;