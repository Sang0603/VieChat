import { useEffect, useState } from "react";
import { X, Phone, MessageCircle, Ban, ShieldCheck, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { friendService } from "@/services/friendService";
import { useFriendStore } from "@/stores/useFriendStore";
import type { Friend } from "@/types/user";

interface FriendProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friendId: string;
  onCall?: (friendId: string) => void;
  onMessage?: (friendId: string) => void;
  onBlock?: (friendId: string) => Promise<boolean> | void;
  onUnfriend?: (friendId: string) => Promise<boolean> | void;
}

export default function FriendProfileDialog({
  open,
  onOpenChange,
  friendId,
  onCall,
  onMessage,
  onBlock,
  onUnfriend,
}: FriendProfileDialogProps) {
  const [friend, setFriend] = useState<Friend | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 👇 MỚI THÊM: đang gọi API chặn/hủy kết bạn/bỏ chặn - disable nút, tránh
  // bấm nhiều lần, và biết để hiện lỗi nếu API fail
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const blockedFriendIds = useFriendStore((s) => s.blockedFriendIds);
  const checkBlockStatus = useFriendStore((s) => s.checkBlockStatus);
  const unblockUser = useFriendStore((s) => s.unblockUser);
  const isBlocked = blockedFriendIds.includes(friendId);

  useEffect(() => {
    if (!open || !friendId) return;

    let ignore = false;
    setLoading(true);
    setError(null);
    setActionError(null);
    setFriend(null);

    friendService
      .getFriendProfile(friendId)
      .then((data) => {
        if (!ignore) setFriend(data);
      })
      .catch((error) => {
        console.error("Lỗi khi tải hồ sơ bạn bè", error);
        if (!ignore) {
          setError(
            error?.response?.data?.message ?? "Không thể tải thông tin người dùng"
          );
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    checkBlockStatus(friendId);

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, friendId]);

  const handleBlock = async () => {
    if (!friend) return;
    if (
      !window.confirm(
        `Chặn ${friend.displayName}? Hai người sẽ không thể nhắn tin hay gọi cho nhau.`
      )
    )
      return;

    setActionError(null);
    setActionLoading(true);
    try {
      const result = await onBlock?.(friend._id);
      // 👇 MỚI THÊM: chỉ đóng dialog nếu THẬT SỰ thành công, không đóng mù
      if (result === false) {
        setActionError("Chặn thất bại, vui lòng thử lại.");
        return;
      }
      onOpenChange(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfriend = async () => {
    if (!friend) return;
    if (!window.confirm(`Xóa ${friend.displayName} khỏi danh sách bạn bè?`)) return;

    setActionError(null);
    setActionLoading(true);
    try {
      const result = await onUnfriend?.(friend._id);
      if (result === false) {
        setActionError("Xóa bạn thất bại, vui lòng thử lại.");
        return;
      }
      onOpenChange(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!window.confirm(`Bỏ chặn ${friend?.displayName ?? "người này"}?`)) return;

    setActionError(null);
    setActionLoading(true);
    try {
      const ok = await unblockUser(friendId);
      if (!ok) {
        setActionError("Bỏ chặn thất bại, vui lòng thử lại.");
        return;
      }
      onOpenChange(false);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 gap-0 overflow-hidden rounded-xl"
        showCloseButton={false}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-base font-semibold">Thông tin tài khoản</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 hover:bg-muted transition-colors"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => onOpenChange(false)}
              className="text-sm text-primary font-medium hover:underline"
            >
              Đóng
            </button>
          </div>
        ) : !friend ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[80vh] overflow-y-auto">
            <div className="relative">
              <div className="h-20 w-full bg-muted" />
              <div className="px-4">
                <Avatar className="h-16 w-16 border-4 border-background -mt-8">
                  <AvatarImage src={friend.avatarUrl} alt={friend.displayName} />
                  <AvatarFallback>{friend.displayName?.[0]}</AvatarFallback>
                </Avatar>
              </div>
            </div>

            <div className="px-4 pt-2 pb-4">
              <p className="text-lg font-semibold">{friend.displayName}</p>
              {friend.bio && (
                <p className="text-sm text-muted-foreground mt-1">{friend.bio}</p>
              )}

              {isBlocked ? (
                <div className="mt-3 rounded-md bg-destructive/10 text-destructive text-xs px-3 py-2">
                  Bạn đã chặn người này. Gọi điện và nhắn tin sẽ không hoạt động.
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onCall?.(friend._id)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    Gọi điện
                  </button>
                  <button
                    onClick={() => onMessage?.(friend._id)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Nhắn tin
                  </button>
                </div>
              )}
            </div>

            <Separator />

            <div className="px-4 py-4">
              <p className="text-sm font-semibold text-muted-foreground mb-2">
                Thông tin cá nhân
              </p>
              <dl className="space-y-2 text-sm">
                {friend.gender && (
                  <div className="flex">
                    <dt className="w-28 text-muted-foreground">Giới tính</dt>
                    <dd>{friend.gender}</dd>
                  </div>
                )}
                {(friend.dateOfBirth || friend.dateOfBirthHidden) && (
                  <div className="flex">
                    <dt className="w-28 text-muted-foreground">Ngày sinh</dt>
                    <dd>{friend.dateOfBirthHidden ? "••/••/••••" : friend.dateOfBirth}</dd>
                  </div>
                )}
                {(friend.phone || friend.phoneHidden) && (
                  <div className="flex">
                    <dt className="w-28 text-muted-foreground">Điện thoại</dt>
                    <dd>{friend.phoneHidden ? "•••••••••" : friend.phone}</dd>
                  </div>
                )}
              </dl>
            </div>

            <Separator />

            {/* 👇 MỚI THÊM: hiện lỗi rõ ràng nếu chặn/bỏ chặn/xóa bạn thất bại */}
            {actionError && (
              <div className="mx-4 mb-2 rounded-md bg-destructive/10 text-destructive text-xs px-3 py-2">
                {actionError}
              </div>
            )}

            <div className="py-2">
              {isBlocked ? (
                <ActionRow
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Bỏ chặn người dùng này"
                  onClick={handleUnblock}
                  disabled={actionLoading}
                />
              ) : (
                <ActionRow
                  icon={<Ban className="h-4 w-4" />}
                  label="Chặn tin nhắn và cuộc gọi"
                  onClick={handleBlock}
                  disabled={actionLoading}
                />
              )}
              <ActionRow
                icon={<Trash2 className="h-4 w-4" />}
                label="Xóa khỏi danh sách bạn bè"
                onClick={handleUnfriend}
                disabled={actionLoading}
                destructive
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  destructive,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        destructive ? "text-destructive" : ""
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}