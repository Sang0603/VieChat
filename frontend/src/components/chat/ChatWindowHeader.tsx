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
import ExpenseSheet from "../expense/ExpenseSheet"; // 👈 MỚI THÊM
import GroupMembersDialog from "./GroupMembersDialog"; // 🆕 MỚI THÊM
import { ShieldBan, UserPlus, Loader2, Wallet, Users, Phone, Video } from "lucide-react"; // 🆕 thêm Phone, Video
import { Button } from "../ui/button";
import { toast } from "sonner";
import { useStartCall } from "@/hooks/useStartCall"; // 👈 MỚI THÊM
import { useCallStore } from "@/stores/useCallStore"; // 🆕 gọi nhóm
import { useGroupCallStore } from "@/stores/useGroupCallStore"; // 🆕 gọi nhóm

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId, typingUsers, setActiveConversation } =
    useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers, socket } = useSocketStore(); // 🆕 lấy thêm socket
  const blockedFriendIds = useFriendStore((s) => s.blockedFriendIds);
  const friends = useFriendStore((s) => s.friends);
  const sentList = useFriendStore((s) => s.sentList);
  const addFriend = useFriendStore((s) => s.addFriend);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [unblocking, setUnblocking] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false); // 👈 MỚI THÊM: bảng chi tiêu của nhóm
  const [membersOpen, setMembersOpen] = useState(false); // 🆕 MỚI THÊM: xem/thêm thành viên nhóm

  // 🆕 MỚI THÊM: trạng thái gọi 1-1 và gọi nhóm (để khoá nút khi đang bận)
  const callStatus = useCallStore((s) => s.status);
  const groupCallStatus = useGroupCallStore((s) => s.status);
  const startGroupCall = useGroupCallStore((s) => s.startCall);
  const canGroupCall = callStatus === "idle" && groupCallStatus === "idle" && !!socket;

  let otherUser: Conversation["participants"][number] | null | undefined;

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  // 👇 MỚI THÊM: phải gọi hook TRƯỚC bất kỳ early return nào (rules of
  // hooks) - dùng chat?._id vì lúc này chat có thể vẫn chưa xác định.
  const { startCall } = useStartCall(chat?._id ?? "");

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

  const handleUnblock = async () => {
    if (!otherUser || unblocking) return;

    setUnblocking(true);
    try {
      const success = await useFriendStore.getState().unblockUser(otherUser._id);
      if (success) {
        toast.success("Đã bỏ chặn người dùng này");
      } else {
        toast.error("Lỗi xảy ra khi bỏ chặn, vui lòng thử lại");
      }
    } finally {
      setUnblocking(false);
    }
  };

  // 👇 MỚI THÊM: bấm "Gọi điện" trong FriendProfileDialog (mở từ header).
  // Trước đây thiếu hẳn onCall/onMessage khi truyền vào FriendProfileDialog
  // ở dưới, nên 2 nút bấm không có tác dụng gì (không lỗi, chỉ là no-op vì
  // onCall?.(...) optional).
  const handleCall = () => {
    if (!otherUser) return;
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

  // 🆕 MỚI THÊM: bấm nút gọi thoại / video của nhóm
  const handleGroupCall = (callType: "audio" | "video") => {
    if (!chat || !canGroupCall) return;
    startGroupCall({
      conversationId: chat._id,
      callType,
      groupName: chat.group?.name ?? "",
    });
  };

  // 👇 MỚI THÊM: bấm "Nhắn tin" - đang xem đúng đoạn chat này rồi nên chỉ
  // cần đóng dialog lại, đồng thời đảm bảo đúng conversation đang active
  // (phòng trường hợp `chat` truyền vào khác với activeConversationId).
  const handleMessage = () => {
    if (!chat) return;
    setActiveConversation(chat._id);
    setProfileOpen(false);
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
              // 🆕 MỚI THÊM: bấm vào avatar/tên nhóm -> mở danh sách thành viên
              if (chat?.type === "group") setMembersOpen(true);
            }}
            className="flex items-center gap-3 min-w-0 cursor-pointer"
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
              {/* 🆕 MỚI THÊM: hiện số thành viên dưới tên nhóm */}
              {chat.type === "group" && !isTyping && (
                <p className="text-xs text-muted-foreground truncate">
                  {chat.participants.length} thành viên
                </p>
              )}
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
            {/* 🆕 MỚI THÊM: gọi thoại / gọi video nhóm */}
            {chat.type === "group" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Gọi thoại nhóm"
                  title="Gọi thoại nhóm"
                  disabled={!canGroupCall}
                  onClick={() => handleGroupCall("audio")}
                >
                  <Phone className="size-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Gọi video nhóm"
                  title="Gọi video nhóm"
                  disabled={!canGroupCall}
                  onClick={() => handleGroupCall("video")}
                >
                  <Video className="size-5" />
                </Button>
              </>
            )}
            {/* 🆕 MỚI THÊM: xem / thêm thành viên nhóm */}
            {chat.type === "group" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Thành viên nhóm"
                title="Thành viên nhóm"
                onClick={() => setMembersOpen(true)}
              >
                <Users className="size-5" />
              </Button>
            )}
            {/* 👇 MỚI THÊM: chi tiêu chung của nhóm (chia tiền + VietQR) */}
            {chat.type === "group" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Chi tiêu của nhóm"
                title="Chi tiêu của nhóm"
                onClick={() => setExpenseOpen(true)}
              >
                <Wallet className="size-5" />
              </Button>
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
          <span className="flex-1">
            Bạn đã chặn người này. Gọi điện và nhắn tin sẽ không hoạt động.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={handleUnblock}
            disabled={unblocking}
          >
            {unblocking ? <Loader2 className="size-3.5 animate-spin" /> : "Bỏ chặn"}
          </Button>
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
          onCall={handleCall} // 👈 MỚI THÊM
          onMessage={handleMessage} // 👈 MỚI THÊM
          onBlock={(friendId) => useFriendStore.getState().blockFriend(friendId)}
          onUnfriend={(friendId) => useFriendStore.getState().unfriend(friendId)}
        />
      )}

      {/* 🆕 MỚI THÊM: dialog xem / thêm thành viên nhóm */}
      {chat.type === "group" && (
        <GroupMembersDialog
          chat={chat}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
      )}

      {/* 👇 MỚI THÊM: bảng chi tiêu của nhóm */}
      {chat.type === "group" && (
        <ExpenseSheet
          chat={chat}
          open={expenseOpen}
          onOpenChange={setExpenseOpen}
        />
      )}
    </header>
  );
};

export default ChatWindowHeader;