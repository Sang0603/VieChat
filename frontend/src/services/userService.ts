import api from "@/lib/axios";
import type { User, UserPrivacy } from "@/types/user";

export type UpdateProfilePayload = Partial<Pick<User, "displayName" | "phone" | "bio" | "gender" | "dateOfBirth">>;

export type UpdatePrivacyPayload = Partial<UserPrivacy>;

export const userService = {
  uploadAvatar: async (formData: FormData) => {
    const res = await api.post("/users/uploadAvatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    if (res.status === 400) throw new Error(res.data.message);
    return res.data;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.post("/users/changePassword", {
      currentPassword,
      newPassword,
    });
    if (res.status === 400) throw new Error(res.data.message);
    return res.data;
  },

  updateProfile: async (payload: UpdateProfilePayload) => {
    const res = await api.patch("/users/updateProfile", payload);
    if (res.status === 400) throw new Error(res.data.message);
    return res.data;
  },

  updatePrivacy: async (payload: UpdatePrivacyPayload) => {
    const res = await api.patch("/users/privacy", payload);
    if (res.status === 400) throw new Error(res.data.message);
    return res.data;
  },
};