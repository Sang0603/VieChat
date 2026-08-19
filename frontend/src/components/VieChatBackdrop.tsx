// VieChatBackdrop.tsx
// Nền động PHỦ TOÀN TRANG cho VieChat - chủ đề lụa đỏ, ngôi sao vàng, cờ Tổ quốc.
//
// Ảnh nền (lụa đỏ + ngôi sao + cờ, NGUYÊN VẸN như ảnh gốc, không tách rời) đặt tại:
// src/assets/viechat-bg.jpg
//
// Toàn bộ khối ảnh nền (ngôi sao dính liền lụa đỏ) cùng nhấp nhô lên xuống với nhau,
// nên ngôi sao không bị cắt/tách rời khỏi phần lụa phía sau nó.
// Phía trên ngôi sao có thêm 1 lớp tia sáng toả ra (sunburst) tự xoay, và di chuyển
// nhấp nhô CÙNG PHA với ảnh nền để luôn bám đúng vị trí ngôi sao.
//
// Vị trí tâm ngôi sao trong ảnh nền được tính bằng JS dựa theo toạ độ gốc (đo 1 lần trên
// ảnh gốc kích thước ORIGINAL_IMAGE_WIDTH x ORIGINAL_IMAGE_HEIGHT), quy đổi đúng theo cách
// trình duyệt scale ảnh nền kiểu "cover" (giống background-size: cover), nên tia sáng luôn
// nằm đúng chỗ ngôi sao dù màn hình to nhỏ / tỉ lệ khác nhau.
//
// Cách dùng: đặt <VieChatBackdrop /> làm phần tử ĐẦU TIÊN trong div bọc ngoài cùng
// có class "relative min-h-screen overflow-hidden", card đăng nhập/đăng ký đặt sau, với class "relative z-10".

import { useEffect, useRef, useState } from "react";
import viechatBg from "@/assets/viechat-bg.jpg";

// Kích thước ảnh nền gốc và toạ độ (px) của TÂM ngôi sao trong ảnh đó.
// Nếu sau này bạn đổi ảnh nền khác, chỉ cần đo lại các số STAR_* này.
const ORIGINAL_IMAGE_WIDTH = 1701;
const ORIGINAL_IMAGE_HEIGHT = 925;
const STAR_CENTER_X = 69 + 685 / 2; // toạ độ x tâm ngôi sao trong ảnh gốc
const STAR_CENTER_Y = 141 + 671 / 2; // toạ độ y tâm ngôi sao trong ảnh gốc
const STAR_WIDTH = 685;

// Đàn chim bồ câu bay khắp trang - mỗi con có độ cao, tốc độ, kích thước, hướng bay riêng
const doves = [
  { top: "10%", size: 34, duration: "16s", delay: "0s", direction: 1 as const },
  { top: "70%", size: 24, duration: "20s", delay: "3s", direction: -1 as const },
  { top: "22%", size: 20, duration: "18s", delay: "6.5s", direction: 1 as const },
  { top: "82%", size: 28, duration: "22s", delay: "1.5s", direction: -1 as const },
  { top: "42%", size: 18, duration: "24s", delay: "9s", direction: 1 as const },
  { top: "58%", size: 22, duration: "19s", delay: "4.5s", direction: -1 as const },
];

// hình chim bồ câu vẽ bằng SVG, 2 cánh tách riêng để có thể tự vỗ cánh bằng CSS
const DoveIcon = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size * 0.68} viewBox="0 0 64 44" fill="none">
    <path
      d="M32 22 C 26 6, 10 2, 0 8 C 10 12, 18 16, 24 22 C 18 28, 10 32, 0 36 C 10 42, 26 38, 32 22 Z"
      fill="white"
      className="vc-dove-wing-left"
    />
    <path
      d="M32 22 C 38 6, 54 2, 64 8 C 54 12, 46 16, 40 22 C 46 28, 54 32, 64 36 C 54 42, 38 38, 32 22 Z"
      fill="white"
      className="vc-dove-wing-right"
    />
    <ellipse cx="32" cy="22" rx="4" ry="3" fill="white" />
  </svg>
);

// Tính vị trí thực tế của tâm ngôi sao trên màn hình, mô phỏng đúng cách trình duyệt
// scale ảnh nền kiểu "background-size: cover" bên trong container.
function useCoverRect(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [rect, setRect] = useState({ scale: 1, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const scale = Math.max(cw / ORIGINAL_IMAGE_WIDTH, ch / ORIGINAL_IMAGE_HEIGHT);
      const renderedW = ORIGINAL_IMAGE_WIDTH * scale;
      const renderedH = ORIGINAL_IMAGE_HEIGHT * scale;
      const offsetX = (cw - renderedW) / 2;
      const offsetY = (ch - renderedH) / 2;
      setRect({ scale, offsetX, offsetY });
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [containerRef]);

  return rect;
}

export default function VieChatBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scale, offsetX, offsetY } = useCoverRect(containerRef);

  const starCenterLeft = offsetX + STAR_CENTER_X * scale;
  const starCenterTop = offsetY + STAR_CENTER_Y * scale;
  const starWidth = STAR_WIDTH * scale;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Khối ảnh nền: lụa đỏ + NGÔI SAO + cờ Tổ quốc, dính liền nhau, cùng nhấp nhô lên xuống.
          Phóng to nhẹ (scale 1.06) để khi trôi lên/xuống không bao giờ lộ mép trống. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${viechatBg})`,
          animation: "vc-star-bob 3.6s ease-in-out infinite",
          transformOrigin: "center center",
          scale: "1.06",
        }}
      />
      {/* phủ tối nhẹ để form phía trên (z-10) dễ đọc hơn trên nền đỏ rực */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Vầng sáng + tia sáng toả ra (sunburst) bám theo đúng vị trí ngôi sao, cùng nhấp nhô */}
      <div
        className="absolute"
        style={{
          left: starCenterLeft,
          top: starCenterTop,
          width: starWidth * 1.9,
          height: starWidth * 1.9,
          transform: "translate(-50%, -50%)",
          animation: "vc-star-bob 3.6s ease-in-out infinite",
        }}
      >
        {/* vầng sáng mềm phía sau tia nắng */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(250,204,21,0.45) 0%, rgba(250,204,21,0) 65%)",
            animation: "vc-star-pulse 4s ease-in-out infinite",
          }}
        />
        {/* tia sáng toả ra kiểu mặt trời, tự xoay liên tục */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 h-full w-full"
          style={{ animation: "vc-star-rotate 24s linear infinite" }}
        >
          <defs>
            <radialGradient id="vc-sunburst-fade" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor="rgba(255,224,130,0.75)"
              />
              <stop
                offset="55%"
                stopColor="rgba(250,204,21,0.28)"
              />
              <stop
                offset="100%"
                stopColor="rgba(250,204,21,0)"
              />
            </radialGradient>
          </defs>
          <g transform="translate(100,100)">
            {Array.from({ length: 16 }).map((_, i) => {
              const angle = (360 / 16) * i;
              return (
                <polygon
                  key={i}
                  points="0,0 -3.2,-95 3.2,-95"
                  fill="url(#vc-sunburst-fade)"
                  transform={`rotate(${angle})`}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Đàn chim bồ câu bay ngang trời, vỗ cánh liên tục */}
      {doves.map((d, i) => (
        <div
          key={`dove-${i}`}
          className="absolute"
          style={{
            top: d.top,
            left: d.direction === 1 ? "-10%" : "auto",
            right: d.direction === -1 ? "-10%" : "auto",
            animation: `${d.direction === 1 ? "vc-fly-right" : "vc-fly-left"} ${d.duration} linear ${d.delay} infinite`,
          }}
        >
          <div
            style={{
              animation: "vc-bob 2.2s ease-in-out infinite",
              transform: d.direction === -1 ? "scaleX(-1)" : undefined,
            }}
          >
            <DoveIcon size={d.size} />
          </div>
        </div>
      ))}

      <style>{`
        @keyframes vc-star-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes vc-star-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes vc-star-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-18px); }
        }
        @keyframes vc-fly-right {
          from { transform: translateX(0); }
          to { transform: translateX(120vw); }
        }
        @keyframes vc-fly-left {
          from { transform: translateX(0); }
          to { transform: translateX(-120vw); }
        }
        @keyframes vc-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .vc-dove-wing-left, .vc-dove-wing-right {
          transform-origin: 32px 22px;
          animation: vc-wing-flap 0.55s ease-in-out infinite alternate;
        }
        .vc-dove-wing-right {
          animation-delay: 0.05s;
        }
        @keyframes vc-wing-flap {
          from { transform: scaleY(1); }
          to { transform: scaleY(0.55); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
