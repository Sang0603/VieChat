import { useState } from "react";
import { Shield, Bell, ShieldBan, Phone, Cake, UserX } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ChangePasswordDialog from "./ChangePasswordDialog";
import BlockedUsersDialog from "./BlockedUsersDialog";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUserStore } from "@/stores/useUserStore";

const PrivacySettings = () => {
  const { user } = useAuthStore();
  const updatePrivacy = useUserStore((s) => s.updatePrivacy);

  const [showPhone, setShowPhone] = useState(user?.privacy?.showPhone ?? true);
  const [showDateOfBirth, setShowDateOfBirth] = useState(
    user?.privacy?.showDateOfBirth ?? true
  );
  // 👇 chặn tin nhắn từ người chưa kết bạn, mặc định tắt
  const [blockStrangerMessages, setBlockStrangerMessages] = useState(
    user?.privacy?.blockStrangerMessages ?? false
  );
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  const handleTogglePhone = async (checked: boolean) => {
    setShowPhone(checked);
    const ok = await updatePrivacy({ showPhone: checked });
    if (!ok) setShowPhone(!checked);
  };

  const handleToggleDob = async (checked: boolean) => {
    setShowDateOfBirth(checked);
    const ok = await updatePrivacy({ showDateOfBirth: checked });
    if (!ok) setShowDateOfBirth(!checked);
  };

  const handleToggleBlockStranger = async (checked: boolean) => {
    setBlockStrangerMessages(checked);
    const ok = await updatePrivacy({ blockStrangerMessages: checked });
    if (!ok) setBlockStrangerMessages(!checked);
  };

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Quyền riêng tư & Bảo mật
        </CardTitle>
        <CardDescription>
          Quản lý cài đặt quyền riêng tư và bảo mật của bạn
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">
            Hiển thị với bạn bè
          </h4>

          <div className="flex items-center justify-between rounded-md glass-light border border-border/30 px-3 py-2.5">
            <Label htmlFor="showPhone" className="flex items-center gap-2 cursor-pointer">
              <Phone className="h-4 w-4" />
              Số điện thoại
            </Label>
            <Switch id="showPhone" checked={showPhone} onCheckedChange={handleTogglePhone} />
          </div>

          <div className="flex items-center justify-between rounded-md glass-light border border-border/30 px-3 py-2.5">
            <Label htmlFor="showDob" className="flex items-center gap-2 cursor-pointer">
              <Cake className="h-4 w-4" />
              Ngày sinh
            </Label>
            <Switch id="showDob" checked={showDateOfBirth} onCheckedChange={handleToggleDob} />
          </div>

          <div className="flex items-center justify-between rounded-md glass-light border border-border/30 px-3 py-2.5">
            <Label
              htmlFor="blockStranger"
              className="flex items-center gap-2 cursor-pointer"
            >
              <UserX className="h-4 w-4" />
              Chặn tin nhắn từ người lạ
            </Label>
            <Switch
              id="blockStranger"
              checked={blockStrangerMessages}
              onCheckedChange={handleToggleBlockStranger}
            />
          </div>
        </div>

        <div className="space-y-4">
          <ChangePasswordDialog />

          <Button
            variant="outline"
            className="w-full justify-start glass-light border-border/30 hover:text-info"
          >
            <Bell className="h-4 w-4 mr-2" />
            Cài đặt thông báo
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start glass-light border-border/30 hover:text-destructive"
            onClick={() => setBlockedDialogOpen(true)}
          >
            <ShieldBan className="size-4 mr-2" />
            Người dùng đã chặn
          </Button>
        </div>

        <div className="pt-4 border-t border-border/30">
          <h4 className="font-medium mb-3 text-destructive">Khu vực nguy hiểm</h4>
          <Button variant="destructive" className="w-full">
            Xoá tài khoản
          </Button>
        </div>
      </CardContent>

      <BlockedUsersDialog open={blockedDialogOpen} onOpenChange={setBlockedDialogOpen} />
    </Card>
  );
};

export default PrivacySettings;