import { userService } from "@/services/userService";
import type { UserState } from "@/types/store";
import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { toast } from "sonner";
import { useChatStore } from "./useChatStore";

export const useUserStore = create<UserState>((_set, _get) => ({
  updateAvatarUrl: async (formData) => {
    try {
      const { user, setUser } = useAuthStore.getState();
      const data = await userService.uploadAvatar(formData);

      if (user) {
        setUser({
          ...user,
          avatarUrl: data.avatarUrl,
        });

        useChatStore.getState().fetchConversations();
      }
    } catch (error) {
      console.error("Lỗi khi updateAvatarUrl", error);
      toast.error("Upload avatar không thành công!");
    }
  },

  updateProfile: async (payload) => {
    try {
      const { user, setUser } = useAuthStore.getState();
      const data = await userService.updateProfile(payload);

      if (user) {
        setUser({
          ...user,
          ...data.user,
        });
      }

      toast.success("Cập nhật thông tin thành công!");
      return true;
    } catch (error) {
      console.error("Lỗi khi updateProfile", error);
      toast.error("Cập nhật thông tin không thành công!");
      return false;
    }
  },
}));