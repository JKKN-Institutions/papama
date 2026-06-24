"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/**
 * Renders a QR code from `payload` into a canvas element entirely client-side,
 * using the bundled `qrcode` package. No data leaves the browser — replaces the
 * third-party https://api.qrserver.com URL that leaked the one-time QR payload.
 */
export function TokenQrCode({
  payload,
  size = 140,
}: {
  payload: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !payload) return;

    QRCode.toCanvas(canvas, payload, {
      width: size,
      margin: 1,
      color: { dark: "#18181b", light: "#ffffff" },
    }).catch((err) => {
      console.error("QR generation failed:", err);
    });
  }, [payload, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-label="Voucher QR code"
      className="rounded"
    />
  );
}
