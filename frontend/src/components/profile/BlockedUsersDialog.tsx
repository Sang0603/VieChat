import { useEffect } from "react";
import { Loader2, ShieldBan } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useFriendStore } from "@/stores/useFriendStore";

interface BlockedUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BlockedUsersDialog = ({ open, onOpenChange }: BlockedUsersDialogProps) => {
  const blockedUsers = useFriendStore((s) => s.blockedUsers);
  const loading = useFriendStore((s) => s.loading);
  const getBlockedUsers = useFriendStore((s) => s.getBlockedUsers);
  const unblockUser = useFriendStore((s) => s.unblockUser);

  useEffect(() => {
    if (open) getBlockedUsers();
  }, [open, getBlockedUsers]);

  const handleUnblock = async (userId: string, displayName: string) => {
    if (!window.confirm(`Bỏ chặn ${displayName}?`)) return;
    await unblockUser(userId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldBan className="h-5 w-5" />
            Người dùng đã chặn
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Bạn chưa chặn người dùng nào
          </p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {blockedUsers.map((u) => (
              <div
                key={u._id}
                className="flex items-center gap-3 rounded-md glass-light border border-border/30 px-3 py-2.5"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={u.avatarUrl ?? undefined} alt={u.displayName} />
                  <AvatarFallback>{u.displayName?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUnblock(u._id, u.displayName)}
                >
                  Bỏ chặn
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BlockedUsersDialog;