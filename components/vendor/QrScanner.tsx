"use client";

/**
 * <QrScanner> — camera-based QR scan for the vendor scan flow.
 *
 * Opens the rear camera and runs html5-qrcode entirely in the browser; on a
 * successful decode it stops the camera and hands the raw payload string to
 * `onDecode`. The scan page keeps a paste <input> as a fallback for when the
 * camera is unavailable, so this component is a pure enhancement — it never
 * becomes a hard dependency of the redemption flow.
 *
 * The library is imported dynamically (client-only) to keep it out of the server
 * bundle, mirroring how <FaceCapture> lazy-loads @vladmandic/human.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { Html5Qrcode } from "html5-qrcode";

interface QrScannerProps {
    /** Called with the decoded QR text once; the camera is stopped before this fires. */
    onDecode: (text: string) => void;
    /** Disable the start button (e.g. while the parent form is submitting). */
    disabled?: boolean;
}

type Status = "idle" | "starting" | "scanning" | "decoded" | "error";

const REGION_ID = "vendor-qr-region";

// html5-qrcode's Html5QrcodeScannerState.SCANNING === 2.
const STATE_SCANNING = 2;

export default function QrScanner({ onDecode, disabled }: QrScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [status, setStatus] = useState<Status>("idle");
    const [errorDetail, setErrorDetail] = useState<string | null>(null);

    const stop = useCallback(async () => {
        const scanner = scannerRef.current;
        if (!scanner) return;
        try {
            // Only stop a live scan (getState() === SCANNING).
            if (scanner.getState() === STATE_SCANNING) await scanner.stop();
            scanner.clear();
        } catch {
            /* already stopped / torn down — ignore */
        }
        scannerRef.current = null;
    }, []);

    // Tear the camera down on unmount.
    useEffect(() => {
        return () => {
            void stop();
        };
    }, [stop]);

    const start = useCallback(async () => {
        setErrorDetail(null);
        setStatus("starting");
        try {
            const { Html5Qrcode } = await import("html5-qrcode");
            const scanner = new Html5Qrcode(REGION_ID);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 250 },
                (decodedText) => {
                    setStatus("decoded");
                    void stop();
                    onDecode(decodedText);
                },
                () => {
                    /* per-frame "not found" callback — noisy, intentionally ignored */
                }
            );
            setStatus("scanning");
        } catch (err) {
            console.error("[QrScanner] start failed", err);
            setErrorDetail(cameraErrorMessage(err));
            setStatus("error");
            await stop();
        }
    }, [onDecode, stop]);

    return (
        <div className="flex flex-col gap-2">
            {/* html5-qrcode injects the <video> into this region. */}
            <div
                id={REGION_ID}
                className={`overflow-hidden rounded-lg border border-slate-300 bg-slate-900 ${
                    status === "scanning" || status === "starting" ? "" : "hidden"
                }`}
            />

            {status === "error" && errorDetail && (
                <p className="text-xs text-red-600">{errorDetail}</p>
            )}
            {status === "decoded" && (
                <p className="text-xs text-green-600">QR decoded ✓</p>
            )}

            <div className="flex gap-2">
                {status !== "scanning" && status !== "starting" ? (
                    <button
                        type="button"
                        onClick={start}
                        disabled={disabled}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                        {status === "decoded" ? "Scan again" : "Scan with camera"}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => void stop().then(() => setStatus("idle"))}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                    >
                        Stop camera
                    </button>
                )}
            </div>
        </div>
    );
}

/** Map a getUserMedia/DOMException to an actionable message. */
function cameraErrorMessage(err: unknown): string {
    const name = err instanceof Error ? err.name : "";
    switch (name) {
        case "NotAllowedError":
        case "SecurityError":
            return "Camera permission is blocked. Click the camera icon in the address bar → Allow, then reload and retry.";
        case "NotFoundError":
        case "OverconstrainedError":
            return "No camera was found on this device — paste the code instead.";
        case "NotReadableError":
            return "The camera is busy in another app (close Teams/Zoom/Camera), then retry.";
        default:
            return "Could not start the camera — paste the code instead.";
    }
}
