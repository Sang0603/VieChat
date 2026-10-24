import { useEffect, useState } from "react";
import { UserPlus, Loader2, Crown, UserMinus, Trash2, LogOut } from "lucide-react"; // 🆕 thêm LogOut
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import IniviteSuggestionList from "../newGroupChat/IniviteSuggestionList";
import SelectedUsersList from "../newGroupChat/SelectedUsersList";
import { chatService } from "@/services/chatService";
import { useChatStore, dropConversationLocally } from "@/stores/useChatStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useGroupCallStore } from "@/stores/useGroupCallStore"; // 🆕 thoát cuộc gọi nhóm khi rời
import type { Conversation } from "@/types/chat";
import type { Friend } from "@/types/user";

interface GroupMembersDialogProps {
  chat: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GroupMembersDialog = ({ chat, open, onOpenChange }: GroupMembersDialogProps) => {
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const { friends, getFriends } = useFriendStore();
  const updateConversation = useChatStore((s) => s.updateConversation);

  const [tab, setTab] = useState("members");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Friend[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null); // 🆕
  const [deleting, setDeleting] = useState(false); // 🆕
  const [leaving, setLeaving] = useState(false); // 🆕 đang rời nhóm

  // 🆕 chỉ chủ nhóm mới được kick / xóa nhóm
  const isOwner = chat.group?.createdBy === user?._id;

  // mở dialog -> tải danh sách bạn bè; đóng dialog -> reset form
  useEffect(() => {
    if (open) {
      getFriends();
    } else {
      setTab("members");
      setSearch("");
      setSelected([]);
    }
  }, [open, getFriends]);

  const memberIds = chat.participants.map((p) => p._id);

  // chỉ gợi ý bạn bè CHƯA ở trong nhóm và chưa được chọn
  const filteredFriends = friends.filter(
    (friend) =>
      !memberIds.includes(friend._id) &&
      !selected.some((u) => u._id === friend._id) &&
      friend.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectFriend = (friend: Friend) => {
    setSelected((prev) => [...prev, friend]);
    setSearch("");
  };

  const handleRemoveFriend = (friend: Friend) => {
    setSelected((prev) => prev.filter((u) => u._id !== friend._id));
  };

  const handleAdd = async () => {
    if (selected.length === 0) {
      toast.warning("Hãy chọn ít nhất 1 người để thêm");
      return;
    }

    setSubmitting(true);
    try {
      const participants = await chatService.addGroupMembers(
        chat._id,
        selected.map((u) => u._id)
      );

      updateConversation({ _id: chat._id, participants });

      toast.success(`Đã thêm ${selected.length} thành viên vào nhóm`);
      setSelected([]);
      setSearch("");
      setTab("members");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Không thể thêm thành viên");
    } finally {
      setSubmitting(false);
    }
  };

  // 🆕 MỚI THÊM: chủ nhóm kick thành viên
  const handleKick = async (memberId: string, name: string) => {
    if (!window.confirm(`Xóa ${name} khỏi nhóm?`)) return;

    setRemovingId(memberId);
    try {
      const participants = await chatService.removeGroupMember(chat._id, memberId);
      updateConversation({ _id: chat._id, participants });
      toast.success(`Đã xóa ${name} khỏi nhóm`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Không thể xóa thành viên");
    } finally {
      setRemovingId(null);
    }
  };

  // 🆕 MỚI THÊM: chủ nhóm xóa hẳn nhóm
  const handleDeleteGroup = async () => {
    if (
      !window.confirm(
        "Xóa nhóm này? Toàn bộ tin nhắn sẽ bị xóa với tất cả thành viên và không thể khôi phục."
      )
    )
      return;

    setDeleting(true);
    try {
      await chatService.deleteGroup(chat._id);
      onOpenChange(false);
      dropConversationLocally(chat._id);
      toast.success("Đã xóa nhóm");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Không thể xóa nhóm");
      setDeleting(false);
    }
  };

  // 🆕 MỚI THÊM: thành viên tự rời nhóm
  const handleLeaveGroup = async () => {
    const isLastMember = chat.participants.length <= 1;

    const confirmText = isLastMember
      ? "Bạn là người cuối cùng trong nhóm. Rời nhóm sẽ xóa hẳn nhóm này. Tiếp tục?"
      : isOwner
      ? "Bạn là chủ nhóm. Khi bạn rời, quyền chủ nhóm sẽ chuyển cho thành viên vào nhóm sớm nhất. Rời nhóm?"
      : "Rời nhóm này? Bạn sẽ không nhận được tin nhắn của nhóm nữa.";

    if (!window.confirm(confirmText)) return;

    setLeaving(true);
    try {
      await chatService.leaveGroup(chat._id);

      // đang trong cuộc gọi nhóm của chính nhóm này -> thoát cuộc gọi luôn
      const call = useGroupCallStore.getState();
      if (call.status !== "idle" && call.conversationId === chat._id) {
        call.endCall();
      }

      onOpenChange(false);
      dropConversationLocally(chat._id);
      toast.success("Đã rời nhóm");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Không thể rời nhóm");
      setLeaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] border-none">
        <DialogHeader>
          <DialogTitle className="truncate">
            {chat.group?.name ?? "Nhóm chat"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members">
              Thành viên ({chat.participants.length})
            </TabsTrigger>
            <TabsTrigger value="add">Thêm thành viên</TabsTrigger>
          </TabsList>

          {/* ============ DANH SÁCH THÀNH VIÊN ============ */}
          <TabsContent value="members">
            <div className="max-h-80 overflow-y-auto space-y-1 pt-2">
              {chat.participants.map((p) => {
                const isCreator = chat.group?.createdBy === p._id;
                const isMe = p._id === user?._id;

                return (
                  <div
                    key={p._id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                  >
                    <div className="relative">
                      <UserAvatar
                        type="sidebar"
                        name={p.displayName}
                        avatarUrl={p.avatarUrl || undefined}
                      />
                      <StatusBadge
                        status={onlineUsers.includes(p._id) ? "online" : "offline"}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.displayName}
                        {isMe && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (Bạn)
                          </span>
                        )}
                      </p>
                    </div>

                    {isCreator && (
                      <span className="flex items-center gap-1 text-xs text-amber-500">
                        <Crown className="size-3.5" />
                        Người tạo nhóm
                      </span>
                    )}

                    {/* 🆕 nút kick: chỉ chủ nhóm thấy, và không kick chính mình */}
                    {isOwner && !isMe && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Xóa ${p.displayName} khỏi nhóm`}
                        title="Xóa khỏi nhóm"
                        disabled={removingId === p._id}
                        onClick={() => handleKick(p._id, p.displayName)}
                      >
                        {removingId === p._id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <UserMinus className="size-4" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 🆕 rời nhóm: AI CŨNG thấy (kể cả chủ nhóm) */}
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleLeaveGroup}
              disabled={leaving || deleting}
            >
              {leaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <LogOut className="size-4 mr-2" />
                  Rời nhóm
                </>
              )}
            </Button>

            {/* 🆕 xóa nhóm: chỉ chủ nhóm thấy */}
            {isOwner && (
              <Button
                type="button"
                variant="destructive"
                className="mt-2 w-full"
                onClick={handleDeleteGroup}
                disabled={deleting || leaving}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="size-4 mr-2" />
                    Xóa nhóm
                  </>
                )}
              </Button>
            )}
          </TabsContent>

          {/* ============ THÊM THÀNH VIÊN ============ */}
          <TabsContent value="add">
            <div className="space-y-3 pt-2">
              <Input
                placeholder="Tìm bạn bè theo tên hiển thị..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {search && filteredFriends.length > 0 && (
                <IniviteSuggestionList
                  filteredFriends={filteredFriends}
                  onSelect={handleSelectFriend}
                />
              )}

              {search && filteredFriends.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Không tìm thấy bạn bè phù hợp (hoặc đã ở trong nhóm).
                </p>
              )}

              <SelectedUsersList
                invitedUsers={selected}
                onRemove={handleRemoveFriend}
              />

              <Button
                type="button"
                onClick={handleAdd}
                disabled={submitting || selected.length === 0}
                className="w-full bg-gradient-chat text-white hover:opacity-90 transition-smooth"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="size-4 mr-2" />
                    Thêm vào nhóm
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default GroupMembersDialog;