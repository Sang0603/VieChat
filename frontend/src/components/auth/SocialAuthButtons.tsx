import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// 🔧 FIX: trước đây dùng <GoogleLogin> (nút iframe do chính Google vẽ).
// Nút đó tự đổi text/avatar thành "Tiếp tục bằng tên ..." khi trình
// duyệt phát hiện có sẵn phiên đăng nhập Google (qua FedCM) -> không thể
// kiểm soát được, và hành vi khác nhau giữa localhost và domain deploy.
// Giờ chuyển sang nút HTML tự vẽ 100% + hook useGoogleLogin (flow
// "implicit") -> nút luôn hiển thị đúng như mình muốn, không bị Google
// ghi đè.
function GoogleButton() {
  const { googleSignIn } = useAuthStore();
  const navigate = useNavigate();

  const afterSignIn = (success: boolean) => {
    if (success) {
      const role = useAuthStore.getState().user?.role;
      navigate(role === "admin" ? "/admin" : "/");
    }
  };

  const login = useGoogleLogin({
    flow: "implicit",
    onSuccess: async (tokenResponse) => {
      const success = await googleSignIn(tokenResponse.access_token);
      afterSignIn(success);
    },
    onError: () => {
      toast.error("Đăng nhập Google thất bại.");
    },
  });

  return (
    <button
      type="button"
      onClick={() => login()}
      className="flex items-center justify-center gap-2 w-full rounded-md border border-border bg-background py-2 px-4 text-sm font-medium hover:bg-muted transition-smooth"
    >
      <svg className="size-4 shrink-0" viewBox="0 0 48 48">
        <path
          fill="#FFC107"
          d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
        />
        <path
          fill="#FF3D00"
          d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4c-7.682 0-14.344 4.337-17.694 10.691z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
        />
      </svg>
      Tiếp tục sử dụng dịch vụ bằng Google
    </button>
  );
}

export function SocialAuthButtons() {
  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  return (
    <>
      <div className="relative text-center text-sm">
        <span className="bg-card text-muted-foreground relative z-10 px-2">Or</span>
        <div className="absolute inset-0 top-1/2 border-t border-border" />
      </div>

      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <GoogleButton />
      </GoogleOAuthProvider>
    </>
  );
}