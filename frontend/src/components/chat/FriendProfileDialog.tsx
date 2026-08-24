import { useState } from "react";
import { X, Phone, MessageCircle, Ban, Trash2, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

// ---- Types: adjust field names to match your actual User model ----
export interface FriendProfile {
  id: string;
  fullName: string;
  avatarUrl?: string;
  coverUrl?: string;
  gender?: "Nam" | "Nữ" | "Khác";
  dateOfBirth?: string; // e.g. "22 tháng 10, 2008"
  phone?: string; // already masked/formatted, e.g. "•••••••••"
}

interface FriendProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friend: FriendProfile;
  onCall?: (friendId: string) => void;
  onMessage?: (friendId: string) => void;
  onBlock?: (friendId: string) => void;
  onUnfriend?: (friendId: string) => void;
}

export default function FriendProfileDialog({
  open,
  onOpenChange,
  friend,
  onCall,
  onMessage,
  onBlock,
  onUnfriend,
}: FriendProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 gap-0 overflow-hidden rounded-xl"
        showCloseButton={false}
      >
        {/* Header */}
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

        <div className="max-h-[80vh] overflow-y-auto">
          {/* Cover + avatar */}
          <div className="relative">
            <div className="h-28 w-full bg-muted">
              {friend.coverUrl && (
                <img
                  src={friend.coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="px-4">
              <Avatar className="h-16 w-16 border-4 border-background -mt-8">
                <AvatarImage src={friend.avatarUrl} alt={friend.fullName} />
                <AvatarFallback>{friend.fullName?.[0]}</AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Name + actions */}
          <div className="px-4 pt-2 pb-4">
            <p className="text-lg font-semibold">{friend.fullName}</p>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onCall?.(friend.id)}
                className="flex-1 flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Phone className="h-4 w-4" />
                Gọi điện
              </button>
              <button
                onClick={() => onMessage?.(friend.id)}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Nhắn tin
              </button>
            </div>
          </div>

          <Separator />

          {/* Personal info */}
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
              {friend.dateOfBirth && (
                <div className="flex">
                  <dt className="w-28 text-muted-foreground">Ngày sinh</dt>
                  <dd>{friend.dateOfBirth}</dd>
                </div>
              )}
              {friend.phone && (
                <div className="flex">
                  <dt className="w-28 text-muted-foreground">Điện thoại</dt>
                  <dd>{friend.phone}</dd>
                </div>
              )}
            </dl>
          </div>

          <Separator />

          {/* Actions: mutual groups / share contact / report removed per request */}
          <div className="py-2">
            <ActionRow
              icon={<Ban className="h-4 w-4" />}
              label="Chặn tin nhắn và cuộc gọi"
              onClick={() => onBlock?.(friend.id)}
            />
            <ActionRow
              icon={<Trash2 className="h-4 w-4" />}
              label="Xóa khỏi danh sách bạn bè"
              onClick={() => onUnfriend?.(friend.id)}
              destructive
            />
          </div>
        </div>
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

/**
 * ---- Example: wiring this up from UserAvatar.tsx ----
 *
 * const [open, setOpen] = useState(false);
 *
 * <button onClick={() => setOpen(true)}>
 *   <Avatar>...</Avatar>
 * </button>
 *
 * <FriendProfileDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   friend={friend}
 *   onCall={(id) => startCall(id)}
 *   onMessage={(id) => openConversation(id)}
 *   onBlock={(id) => blockFriend(id)}
 *   onUnfriend={(id) => removeFriend(id)}
 * />
 */
