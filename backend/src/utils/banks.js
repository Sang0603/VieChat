// Danh sách ngân hàng hỗ trợ VietQR, lấy từ API công khai của VietQR.
// Tài liệu VietQR khuyên làm mới danh sách theo ngày, nên cache 24 giờ.
// ponytail: cache trong bộ nhớ của từng tiến trình; dùng Redis nếu chạy nhiều bản server.

const BANKS_URL = "https://api.vietqr.io/v2/banks";
const CACHE_MS = 24 * 60 * 60 * 1000;

// Dùng khi chưa tải được danh sách từ VietQR (mất mạng, VietQR lỗi).
const FALLBACK_BANKS = [
  { bin: "970425", shortName: "ABBANK", name: "Ngân hàng TMCP An Bình", logo: "" },
  { bin: "970416", shortName: "ACB", name: "Ngân hàng TMCP Á Châu", logo: "" },
  { bin: "970418", shortName: "BIDV", name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam", logo: "" },
  { bin: "970415", shortName: "VietinBank", name: "Ngân hàng TMCP Công Thương Việt Nam", logo: "" },
  { bin: "970432", shortName: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng", logo: "" },
];

let cache = { banks: null, fetchedAt: 0 };
let inflight = null;

const fetchBanks = async () => {
  const res = await fetch(BANKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`VietQR trả về status ${res.status}`);

  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

  const banks = list
    .filter((b) => b && /^\d{6}$/.test(String(b.bin)))
    .map((b) => ({
      bin: String(b.bin),
      shortName: b.shortName ?? b.short_name ?? b.code ?? String(b.bin),
      name: b.name ?? "",
      logo: b.logo ?? "",
    }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, "vi"));

  if (banks.length === 0) throw new Error("Danh sách ngân hàng rỗng");
  return banks;
};

// `live: false` nghĩa là đang dùng danh sách dự phòng (chưa tải được từ VietQR).
export const getBankList = async () => {
  if (cache.banks && Date.now() - cache.fetchedAt < CACHE_MS) {
    return { banks: cache.banks, live: true };
  }

  try {
    inflight ??= fetchBanks().finally(() => {
      inflight = null;
    });
    const banks = await inflight;
    cache = { banks, fetchedAt: Date.now() };
    return { banks, live: true };
  } catch (error) {
    console.error("Không tải được danh sách ngân hàng từ VietQR", error);
    if (cache.banks) return { banks: cache.banks, live: true };
    return { banks: FALLBACK_BANKS, live: false };
  }
};