import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function SocialAuthButtons() {
  const { googleSignIn } = useAuthStore();
  const navigate = useNavigate();

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  const afterSignIn = (success: boolean) => {
    if (success) {
      const role = useAuthStore.getState().user?.role;
      navigate(role === "admin" ? "/admin" : "/");
    }
  };

  return (
    <>
      <div className="relative text-center text-sm">
        <span className="bg-card text-muted-foreground relative z-10 px-2">Or</span>
        <div className="absolute inset-0 top-1/2 border-t border-border" />
      </div>

      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="flex justify-center [&>div]:!w-full">
          <GoogleLogin
            text="continue_with"
            shape="rectangular"
            onSuccess={async (credentialResponse) => {
              if (!credentialResponse.credential) {
                toast.error("Đăng nhập Google thất bại.");
                return;
              }
              const success = await googleSignIn(credentialResponse.credential);
              afterSignIn(success);
            }}
            onError={() => {
              toast.error("Đăng nhập Google thất bại.");
            }}
          />
        </div>
      </GoogleOAuthProvider>
    </>
  );
}