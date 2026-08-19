import { SigninForm } from "@/components/auth/signin-form";
import VieChatBackdrop from "@/components/VieChatBackdrop";

const SignInPage = () => {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10 absolute inset-0 z-0 bg-gradient-purple overflow-hidden">
      <VieChatBackdrop />
      <div className="w-full max-w-sm md:max-w-4xl relative z-10">
        <SigninForm />
      </div>
    </div>
  );
};

export default SignInPage;
