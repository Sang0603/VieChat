export interface UserPrivacy {
  showPhone: boolean;
  showDateOfBirth: boolean;
}

export interface User {
  _id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  gender?: "Nam" | "Nữ" | "Khác";
  dateOfBirth?: string; // ISO string, dùng để đổ vào <input type="date">
  privacy?: UserPrivacy;
  createdAt?: string;
  updatedAt?: string;
}

// Hồ sơ bạn bè xem được - đã qua bộ lọc privacy ở backend
export interface Friend {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  gender?: "Nam" | "Nữ" | "Khác";
  dateOfBirth?: string; // "dd/mm/yyyy", chỉ có khi được phép hiện
  dateOfBirthHidden?: boolean;
  phone?: string; // chỉ có khi được phép hiện
  phoneHidden?: boolean;
}

export interface FriendRequest {
  _id: string;
  from?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  to?: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  message: string;
  createdAt: string;
  updatedAt: string;
}