import { useAuthStore } from "@/stores/useAuthStore";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// gắn access token vào req header
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// 👇 khi nhiều request cùng 403 một lúc (token vừa hết hạn giữa lúc
// trang đang bắn nhiều API), chỉ gọi /auth/refresh MỘT LẦN DUY NHẤT, các
// request còn lại xếp hàng đợi kết quả của lần refresh đó rồi retry lại -
// tránh gọi refresh dồn dập (dính rate limit 429) hoặc đua nhau dùng refresh
// token đã bị xoay vòng (rotate) làm token cũ vô hiệu -> tự logout oan.
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(callback: (token: string | null) => void) {
  refreshSubscribers.push(callback);
}

function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// 🆕 Lỗi có phải do ACCESS TOKEN không hợp lệ/hết hạn hay không.
// Backend hiện trả 403 "Access token hết hạn hoặc không đúng" (và 401 khi
// thiếu token). Các 403 khác (không đủ quyền, bị chặn người lạ, không phải
// chủ nhóm...) KHÔNG liên quan tới token nên không được đi vào luồng refresh.
function isTokenError(error: any): boolean {
  const status = error.response?.status;
  if (status === 401) return true;
  if (status !== 403) return false;

  const message = String(error.response?.data?.message ?? "").toLowerCase();
  return message.includes("token");
}

// tự động gọi refresh api khi access token hết hạn
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    // 🆕 lỗi mạng/timeout: không có config hoặc response -> không có gì để retry
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // những api không cần check
    if (
      originalRequest.url?.includes("/auth/signin") ||
      originalRequest.url?.includes("/auth/signup") ||
      originalRequest.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    // 👇 MỚI THÊM: 403 do bị CHẶN (gửi tin nhắn cho người đã chặn/bị chặn)
    // không liên quan gì tới access token hết hạn - không được đi vào luồng
    // refresh, nếu không sẽ tốn 1 vòng gọi /auth/refresh vô ích và làm chậm
    // phản hồi lỗi "bị chặn" xuống cho UI.
    if (error.response?.status === 403 && error.response?.data?.blocked) {
      return Promise.reject(error);
    }

    // 🔧 SỬA: chỉ refresh khi thật sự là lỗi token (xem isTokenError ở trên)
    if (isTokenError(error) && !originalRequest._retry) {
      originalRequest._retry = true;

      // 👇 nếu đã có 1 request khác đang refresh rồi, không gọi
      // thêm nữa - đứng vào hàng đợi, khi nào refresh xong thì retry
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token) => {
            if (!token) {
              reject(error);
              return;
            }
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // 🔧 SỬA: instance đã bật withCredentials sẵn, không cần truyền vào body
        const res = await api.post("/auth/refresh");
        const newAccessToken = res.data.accessToken;

        useAuthStore.getState().setAccessToken(newAccessToken);
        isRefreshing = false;
        onRefreshed(newAccessToken); // 👈 báo cho các request đang đợi

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshed(null); // 👈 báo thất bại cho các request đang đợi
        useAuthStore.getState().clearState();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;