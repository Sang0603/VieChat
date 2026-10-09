import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "../ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { SocialAuthButtons } from "./SocialAuthButtons";

//  đánh giá độ mạnh mật khẩu theo 5 tiêu chí
// - dưới 8 ký tự                  => yếu (luôn luôn)
// - thiếu 3 tiêu chí trở lên      => yếu
// - thiếu 1-2 tiêu chí            => trung bình
// - đủ 5 tiêu chí                 => mạnh
// (backend dùng đúng quy tắc này, nếu sửa ở đây thì sửa cả authController.js)
const getPasswordStrength = (password: string) => {
  const checks = [
    { label: "ít nhất 8 ký tự", passed: password.length >= 8 },
    { label: "chữ thường", passed: /[a-z]/.test(password) },
    { label: "chữ hoa", passed: /[A-Z]/.test(password) },
    { label: "chữ số", passed: /[0-9]/.test(password) },
    { label: "ký tự đặc biệt (!@#$%...)", passed: /[^a-zA-Z0-9]/.test(password) },
  ];

  const missing = checks.filter((c) => !c.passed).map((c) => c.label);
  const tooShort = password.length < 8;

  if (missing.length === 0) {
    return {
      level: 3,
      text: "Mật khẩu mạnh",
      textClass: "text-green-600",
      barClass: "bg-green-500",
      missing,
    };
  }
  if (!tooShort && missing.length <= 2) {
    return {
      level: 2,
      text: "Mật khẩu trung bình",
      textClass: "text-yellow-600",
      barClass: "bg-yellow-500",
      missing,
    };
  }
  return {
    level: 1,
    text: "Mật khẩu yếu",
    textClass: "text-red-600",
    barClass: "bg-red-500",
    missing,
  };
};

//  SỬA: quy tắc cho tài khoản MỚI
// - chỉ gồm chữ không dấu (a-z), số, dấu chấm, gạch dưới
// - dài 3 đến 30 ký tự
// - gõ chữ hoa vẫn được, tự đổi thành chữ thường
// Mật khẩu: mức YẾU thì KHÔNG cho đăng ký, mức TRUNG BÌNH hoặc MẠNH thì được.
const signUpSchema = z
  .object({
    firstname: z.string().min(1, "Tên bắt buộc phải có"),
    lastname: z.string().min(1, "Họ bắt buộc phải có"),
    account: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9._]*$/,
        "Tài khoản chỉ gồm chữ không dấu, số, dấu chấm và gạch dưới"
      )
      .min(3, "Tài khoản phải từ 3 đến 30 ký tự")
      .max(30, "Tài khoản phải từ 3 đến 30 ký tự"),
    password: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu")
      .refine((value) => getPasswordStrength(value).level >= 2, {
        message:
          "Mật khẩu quá yếu. Cần ít nhất 8 ký tự và kết hợp chữ hoa, chữ thường, số hoặc ký tự đặc biệt",
      }),
    confirmPassword: z.string().min(1, "Vui lòng nhập lại mật khẩu"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu nhập lại không khớp",
    path: ["confirmPassword"],
  });

type SignUpFormValues = z.infer<typeof signUpSchema>;

export function SignupForm({ className, ...props }: React.ComponentProps<"div">) {
  const { signUp } = useAuthStore();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
  });

  //  theo dõi mật khẩu đang gõ để hiện độ mạnh
  const passwordValue = watch("password") ?? "";
  const strength = passwordValue ? getPasswordStrength(passwordValue) : null;

  const onSubmit = async (data: SignUpFormValues) => {
    // confirmPassword chỉ dùng để kiểm tra ở form, không gửi lên backend
    const { firstname, lastname, account, password } = data;

    // gọi backend để signup (tên hiển thị = Họ + Tên, do backend ghép).
    // `account` được gửi đi ở vị trí tham số thứ 2 (backend nhận là `email`)
    await signUp(password, account, firstname, lastname);

    navigate("/signin");
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-6 w-full max-w-md md:ml-auto md:mr-12 lg:mr-20",
        className
      )}
      {...props}
    >
      <Card className="overflow-hidden p-0 border-border">
        <CardContent className="p-0">
          {/* noValidate tắt popup tiếng Anh của trình duyệt,
              lỗi sẽ hiện ngay dưới từng ô bằng tiếng Việt */}
          <form
            className="p-6 md:p-8"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <div className="flex flex-col gap-4 w-full">
              {/* header - logo */}
              <div className="flex flex-col items-center text-center gap-2">
                <a href="/" className="mx-auto block w-fit text-center">
                  <img
                    src="/logo.svg"
                    alt="VieChat logo"
                    className="h-12 w-auto"
                  />
                </a>

                <h1 className="text-2xl font-bold">Tạo tài khoản VieChat</h1>
                <p className="text-muted-foreground text-balance">
                  Chào mừng bạn! Hãy đăng ký để bắt đầu!
                </p>
              </div>

              {/* họ & tên */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="lastname"
                    className="block text-sm"
                  >
                    Họ
                  </Label>
                  <Input
                    type="text"
                    id="lastname"
                    {...register("lastname")}
                  />

                  {errors.lastname && (
                    <p className="error-message">{errors.lastname.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="firstname"
                    className="block text-sm"
                  >
                    Tên
                  </Label>
                  <Input
                    type="text"
                    id="firstname"
                    {...register("firstname")}
                  />
                  {errors.firstname && (
                    <p className="error-message">{errors.firstname.message}</p>
                  )}
                </div>
              </div>

              {/* tài khoản */}
              <div className="flex flex-col gap-3">
                <Label
                  htmlFor="account"
                  className="block text-sm"
                >
                  Tài khoản
                </Label>
                <Input
                  type="text"
                  id="account"
                  placeholder=""
                  autoComplete="username"
                  {...register("account")}
                />
                {errors.account && (
                  <p className="error-message">{errors.account.message}</p>
                )}
              </div>

              {/* password */}
              <div className="flex flex-col gap-3">
                <Label
                  htmlFor="password"
                  className="block text-sm"
                >
                  Mật khẩu
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    className="pr-10"
                    autoComplete="new-password"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-smooth"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>

                {/*  thanh độ mạnh mật khẩu (mức yếu sẽ không đăng ký được) */}
                {strength && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={cn(
                            "h-1.5 flex-1 rounded-full transition-all",
                            step <= strength.level
                              ? strength.barClass
                              : "bg-muted"
                          )}
                        />
                      ))}
                    </div>
                    <p className={cn("text-xs font-medium", strength.textClass)}>
                      {strength.text}
                      {strength.level === 1 && " (chưa thể đăng ký)"}
                      {strength.missing.length > 0 && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · Còn thiếu: {strength.missing.join(", ")}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {errors.password && (
                  <p className="error-message">{errors.password.message}</p>
                )}
              </div>

              {/* nhập lại mật khẩu */}
              <div className="flex flex-col gap-3">
                <Label
                  htmlFor="confirmPassword"
                  className="block text-sm"
                >
                  Nhập lại mật khẩu
                </Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    className="pr-10"
                    autoComplete="new-password"
                    {...register("confirmPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-smooth"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="error-message">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {/* nút đăng ký */}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white shadow-sm"
                disabled={isSubmitting}
              >
                Tạo tài khoản
              </Button>

              <div className="text-center text-sm">
                Đã có tài khoản?{" "}
                <a href="/signin" className="underline underline-offset-4">
                  Đăng nhập
                </a>
              </div>

              {/*  đăng ký bằng Google */}
              <SocialAuthButtons />
            </div>
          </form>
        </CardContent>
      </Card>
      <div className=" text-xs text-balance px-6 text-center *:[a]:hover:text-primary text-muted-foreground *:[a]:underline *:[a]:underline-offetset-4">
        Bằng cách tiếp tục, bạn đồng ý với <a href="#">Điều khoản dịch vụ</a> và{" "}
        <a href="#">Chính sách bảo mật</a> của chúng tôi.
      </div>
    </div>
  );
}
