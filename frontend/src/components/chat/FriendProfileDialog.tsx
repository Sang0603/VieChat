import { useEffect, useState } from "react";
import { X, Phone, MessageCircle, Ban, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { friendService } from "@/services/friendService";
import type { Friend } from "@/types/user";

interface FriendProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friendId: string;
  onCall?: (friendId: string) => void;
  onMessage?: (friendId: string) => void;
  onBlock?: (friendId: string) => void;
  onUnfriend?: (friendId: string) => void;
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

  useEffect(() => {
    if (!open || !friendId) return;

    let ignore = false;
    setLoading(true);

    friendService
      .getFriendProfile(friendId)
      .then((data) => {
        if (!ignore) setFriend(data);
      })
      .catch((error) => {
        console.error("Lỗi khi tải hồ sơ bạn bè", error);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [open, friendId]);

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

        {loading || !friend ? (
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

            <div className="py-2">
              <ActionRow
                icon={<Ban className="h-4 w-4" />}
                label="Chặn tin nhắn và cuộc gọi"
                onClick={() => onBlock?.(friend._id)}
              />
              <ActionRow
                icon={<Trash2 className="h-4 w-4" />}
                label="Xóa khỏi danh sách bạn bè"
                onClick={() => onUnfriend?.(friend._id)}
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
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors ${
        destructive ? "text-destructive" : ""
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}