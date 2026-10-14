import { useEffect, useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { bankService, type Bank, type BankInfo } from "@/services/bankService";

const EMPTY: BankInfo = { bankId: "", accountNo: "", accountName: "" };

const getMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message ?? fallback;

// cùng luật với backend (backend vẫn kiểm tra lại)
const validate = (form: BankInfo): string | null => {
  if (!form.bankId) return "Vui lòng chọn ngân hàng";
  if (!/^\d{6,19}$/.test(form.accountNo)) {
    return "Số tài khoản chỉ gồm chữ số, từ 6 đến 19 ký tự";
  }
  const name = form.accountName.trim();
  if (!name || name.length > 50) {
    return "Tên chủ tài khoản phải từ 1 đến 50 ký tự";
  }
  return null;
};

const BankInfoForm = () => {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [saved, setSaved] = useState<BankInfo | null>(null);
  const [form, setForm] = useState<BankInfo>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([bankService.getBanks(), bankService.getBankInfo()])
      .then(([bankList, info]) => {
        if (cancelled) return;
        setBanks(bankList);
        setSaved(info);
        setForm(info ?? EMPTY);
      })
      .catch(() => {
        if (!cancelled) toast.error("Không tải được tài khoản nhận tiền");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const base = saved ?? EMPTY;
  const isDirty =
    form.bankId !== base.bankId ||
    form.accountNo !== base.accountNo ||
    form.accountName.trim() !== base.accountName;

  const handleSave = async () => {
    const message = validate(form);
    setError(message);
    if (message) return;

    setSaving(true);
    try {
      const result = await bankService.saveBankInfo(form);
      setSaved(result);
      setForm(result ?? EMPTY);
      toast.success("Đã lưu tài khoản nhận tiền");
    } catch (e) {
      toast.error(getMessage(e, "Không lưu được tài khoản nhận tiền. Hãy thử lại!"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm("Xóa tài khoản nhận tiền của bạn?")) return;

    setSaving(true);
    try {
      await bankService.deleteBankInfo();
      setSaved(null);
      setForm(EMPTY);
      setError(null);
      toast.success("Đã xóa tài khoản nhận tiền");
    } catch (e) {
      toast.error(getMessage(e, "Không xóa được. Hãy thử lại!"));
    } finally {
      setSaving(false);
    }
  };

  // ngân hàng đã lưu nhưng không còn trong danh sách (vd đang dùng danh sách dự phòng)
  const missingSavedBank =
    saved && !banks.some((b) => b.bin === saved.bankId) ? saved.bankId : null;

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-5 text-primary" />
          Tài khoản nhận tiền
        </CardTitle>
        <CardDescription>
          Dùng để tạo mã QR khi bạn bè chuyển tiền chia hóa đơn cho bạn
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang tải...
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="bankId">Ngân hàng</Label>
              <select
                id="bankId"
                value={form.bankId}
                onChange={(e) => setForm((f) => ({ ...f, bankId: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border/30 glass-light px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <option value="">Chọn ngân hàng</option>
                {missingSavedBank && (
                  <option value={missingSavedBank}>{missingSavedBank}</option>
                )}
                {banks.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.shortName} - {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountNo">Số tài khoản</Label>
              <Input
                id="accountNo"
                inputMode="numeric"
                maxLength={19}
                value={form.accountNo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountNo: e.target.value.replace(/\D/g, "") }))
                }
                className="glass-light border-border/30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountName">Tên chủ tài khoản</Label>
              <Input
                id="accountName"
                maxLength={50}
                placeholder="Như trên thẻ ngân hàng"
                value={form.accountName}
                onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                className="glass-light border-border/30"
              />
            </div>

            {error && <p className="error-message">{error}</p>}

            <p className="text-xs text-muted-foreground">
              Thông tin này chỉ được gửi cho thành viên nhóm khi họ cần chuyển
              tiền cho bạn. Mã QR được tạo qua dịch vụ img.vietqr.io, nên số tài
              khoản và số tiền sẽ được gửi tới dịch vụ này để vẽ ảnh.
            </p>
          </>
        )}
      </CardContent>

      {!loading && (
        <CardFooter className="justify-end gap-2">
          {saved && (
            <Button variant="outline" onClick={handleRemove} disabled={saving}>
              Xóa
            </Button>
          )}
          <Button onClick={handleSave} disabled={!isDirty || saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default BankInfoForm;