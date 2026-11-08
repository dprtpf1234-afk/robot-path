"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QR({ text, size = 160, label }: { text: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [text, size]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt={label ?? `QR: ${text}`} className="rounded-lg bg-white" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-lg bg-slate-100" />
  );
}
