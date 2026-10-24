import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatOnlineTime = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  // 🔧 SỬA: đổi nhãn viết tắt tiếng Anh (m, h, d, y) sang tiếng Việt
  if (diffMins < 1) {
    return "Vừa xong"; // dưới 1 phút (cũng gồm trường hợp đồng hồ máy lệch nhẹ)
  } else if (diffMins < 60) {
    return `${diffMins} phút`; // 5 phút, 45 phút
  } else if (diffHours < 24) {
    return `${diffHours} giờ`; // 3 giờ, 20 giờ
  } else if (diffDays < 30) {
    return `${diffDays} ngày`; // 1 ngày, 12 ngày
  } else if (diffMonths < 12) {
    return `${diffMonths} tháng`; // 1 tháng, 11 tháng
  } else {
    return `${diffYears} năm`; // 1 năm, 2 năm
  }
};

// 🔧 SỬA: nhãn giờ ở giữa khung chat luôn có kèm ngày, giờ đứng trước:
//   hôm nay  -> "20:50 Hôm nay"
//   hôm qua  -> "23:46 Hôm qua"
//   cũ hơn   -> "17:05 26/09/2026"
export const formatMessageTime = (date: Date) => {
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (isToday) {
    return `${timeStr} Hôm nay`; // ví dụ: "06:31 Hôm nay"
  } else if (isYesterday) {
    return `${timeStr} Hôm qua`; // ví dụ: "23:46 Hôm qua"
  } else {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${timeStr} ${day}/${month}/${date.getFullYear()}`; // ví dụ: "17:05 26/09/2026"
  }
};