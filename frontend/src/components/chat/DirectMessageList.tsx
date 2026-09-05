import { useEffect } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useAuthStore } from "@/stores/useAuthStore";
import DirectMessageCard from "./DirectMessageCard";
import FriendWithoutConvoCard from "./FriendWithoutConvoCard";

const DirectMessageList = () => {
  const { conversations } = useChatStore();
  const friends = useFriendStore((s) => s.friends);
  const getFriends = useFriendStore((s) => s.getFriends);
  const { user } = useAuthStore();

  // 🔧 FIX: đảm bảo danh sách bạn bè luôn được nạp, không phụ thuộc chỗ
  // khác trong app có gọi hay chưa — tránh trường hợp đã là bạn nhưng
  // sidebar không có gì để hiện (nguồn gốc của bug: sidebar trước đây chỉ
  // dựa vào "conversations", không dựa vào "friends")
  useEffect(() => {
    getFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!conversations || !user) return null;

  const directConversations = conversations.filter(
    (convo) => convo.type === "direct"
  );

  // 🔧 FIX: những bạn bè ĐÃ có sẵn conversation -> hiện qua DirectMessageCard
  // như cũ. Những bạn bè CHƯA có conversation nào (vd dữ liệu cũ, hoặc quan
  // hệ bạn bè được tạo mà không kèm conversation) -> vẫn phải hiện ra để
  // bấm vào chat được, không được biến mất khỏi sidebar.
  const friendIdsWithConvo = new Set(
    directConversations
      .map((convo) => convo.participants.find((p) => p._id !== user._id)?._id)
      .filter((id): id is string => Boolean(id))
  );

  const friendsWithoutConvo = friends.filter((f) => !friendIdsWithConvo.has(f._id));

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {directConversations.map((convo) => (
        <DirectMessageCard
          convo={convo}
          key={convo._id}
        />
      ))}
      {friendsWithoutConvo.map((friend) => (
        <FriendWithoutConvoCard
          friend={friend}
          key={friend._id}
        />
      ))}
    </div>
  );
};

export default DirectMessageList;