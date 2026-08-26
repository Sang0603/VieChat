import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/useUserStore";
import type { User } from "@/types/user";

type Props = {
  userInfo: User | null;
};

const GENDER_OPTIONS: NonNullable<User["gender"]>[] = ["Nam", "Nữ", "Khác"];

const toDateInputValue = (iso?: string) => (iso ? iso.slice(0, 10) : "");

const PersonalInfoForm = ({ userInfo }: Props) => {
  const updateProfile = useUserStore((s) => s.updateProfile);

  const [displayName, setDisplayName] = useState(userInfo?.displayName ?? "");
  const [phone, setPhone] = useState(userInfo?.phone ?? "");
  const [bio, setBio] = useState(userInfo?.bio ?? "");
  const [gender, setGender] = useState<User["gender"] | undefined>(userInfo?.gender);
  const [dateOfBirth, setDateOfBirth] = useState(
    toDateInputValue(userInfo?.dateOfBirth)
  );
  const [isSaving, setIsSaving] = useState(false);

  if (!userInfo) return null;

  const isDirty =
    displayName !== (userInfo.displayName ?? "") ||
    phone !== (userInfo.phone ?? "") ||
    bio !== (userInfo.bio ?? "") ||
    gender !== userInfo.gender ||
    dateOfBirth !== toDateInputValue(userInfo.dateOfBirth);

  const handleSave = async () => {
    setIsSaving(true);
    await updateProfile({ displayName, phone, bio, gender, dateOfBirth });
    setIsSaving(false);
  };

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="size-5 text-primary" />
          Thông tin cá nhân
        </CardTitle>
        <CardDescription>Thông tin cá nhân và hồ sơ của bạn</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Tên hiển thị</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="glass-light border-border/30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Tên người dùng</Label>
            <Input
              id="username"
              value={userInfo.username ?? ""}
              readOnly
              className="glass-light border-border/30 cursor-default opacity-70"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={userInfo.email ?? ""}
              readOnly
              className="glass-light border-border/30 cursor-default opacity-70"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="glass-light border-border/30"
            />
          </div>

          <div className="space-y-2">
            <Label>Giới tính</Label>
            <div className="flex gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGender(option)}
                  className={cn(
                    "flex-1 rounded-md border py-2 text-sm font-medium transition-colors glass-light border-border/30",
                    gender === option
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Ngày sinh</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="glass-light border-border/30"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Giới thiệu</Label>
          <Textarea
            id="bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="glass-light border-border/30 resize-none"
          />
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button onClick={handleSave} disabled={!isDirty || isSaving}>
          {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Lưu thay đổi
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PersonalInfoForm;