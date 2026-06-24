"use client";

/**
 * <FaceCapture> — on-device face embedding capture (owner §4.6 / §5.2, F-5).
 *
 * Opens the camera, runs @vladmandic/human entirely IN THE BROWSER, and emits a
 * non-reversible face EMBEDDING + a liveness/anti-spoof score. The raw image NEVER
 * leaves the device — only the vector is handed to `onCapture`. Used by the
 * beneficiary-registration form (enrolment) and, later, the vendor scan page.
 *
 * The model files load from the Human CDN by default; for an offline Play-Store
 * build, copy them into /public/models and set MODEL_BASE_PATH to "/models".
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { FACE_EMBEDDING_DIM, type FaceCapture as FaceCaptureValue } from "@/lib/validation/schemas";

// Switch to "/models" once the model files are bundled into /public/models (offline).
const MODEL_BASE_PATH = "https://vladmandic.github.io/human-models/models/";
const MIN_FACE_SCORE = 0.6; // reject low-confidence detections before we even embed

type Status =
    | "idle"
    | "loading"
    | "ready"
    | "detecting"
    | "no-face"
    | "multi-face"
    | "low-quality"
    | "captured"
    | "error";

interface FaceCaptureProps {
    onCapture: (capture: FaceCaptureValue) => void;
    /** Disable interaction (e.g. while the parent form is submitting). */
    disabled?: boolean;
    /** Override the on-screen label. */
    label?: string;
}

const STATUS_TEXT: Record<Status, string> = {
    idle: "Camera off",
    loading: "Loading face model…",
    ready: "Position the face in frame, then capture",
    detecting: "Analysing…",
    "no-face": "No face detected — try again",
    "multi-face": "Multiple faces detected — only one person in frame",
    "low-quality": "Low quality or possible spoof — hold steady, use good lighting",
    captured: "Face captured ✓",
    error: "Camera/model error — see console",
};

export default function FaceCapture({ onCapture, disabled, label }: FaceCaptureProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    // Human instance is loaded lazily and kept across renders without re-creating.
    const humanRef = useRef<unknown>(null);
    const [status, setStatus] = useState<Status>("idle");
    const [errorDetail, setErrorDetail] = useState<string | null>(null);
    const [active, setActive] = useState(false);

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setActive(false);
    }, []);

    // Tear down the camera on unmount.
    useEffect(() => stopCamera, [stopCamera]);

    const ensureHuman = useCallback(async () => {
        if (humanRef.current) return humanRef.current;
        // Resolves to the browser ESM build via the `turbopack.resolveAlias` in
        // next.config.ts (the package's `node` export condition otherwise pulls in the
        // native @tensorflow/tfjs-node and breaks the build). Loaded client-side only.
        const mod = await import("@vladmandic/human");
        const Human = (mod as { Human?: unknown; default?: unknown }).Human ?? mod.default;
        // Only the face modules we need — keeps the model load light and fast.
        const human = new (Human as new (cfg: unknown) => unknown)({
            modelBasePath: MODEL_BASE_PATH,
            cacheSensitivity: 0,
            face: {
                enabled: true,
                detector: { rotation: true, return: false },
                description: { enabled: true }, // produces `embedding`
                antispoof: { enabled: true }, // produces `real`
                liveness: { enabled: true }, // produces `live`
                mesh: { enabled: true },
                iris: { enabled: false },
                emotion: { enabled: false },
            },
            body: { enabled: false },
            hand: { enabled: false },
            object: { enabled: false },
            gesture: { enabled: false },
            segmentation: { enabled: false },
        });
        await (human as { load: () => Promise<void> }).load();
        await (human as { warmup: () => Promise<unknown> }).warmup();
        humanRef.current = human;
        return human;
    }, []);

    const startCamera = useCallback(async () => {
        try {
            setStatus("loading");
            setErrorDetail(null);
            await ensureHuman();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setActive(true);
            setStatus("ready");
        } catch (err) {
            console.error("[FaceCapture] startCamera failed", err);
            setErrorDetail(cameraErrorMessage(err));
            setStatus("error");
            stopCamera();
        }
    }, [ensureHuman, stopCamera]);

    const capture = useCallback(async () => {
        if (!videoRef.current || !humanRef.current) return;
        setStatus("detecting");
        try {
            const human = humanRef.current as {
                detect: (input: HTMLVideoElement) => Promise<{ face: FaceLike[] }>;
            };
            const result = await human.detect(videoRef.current);
            const faces = result.face ?? [];

            if (faces.length === 0) return setStatus("no-face");
            if (faces.length > 1) return setStatus("multi-face");

            const face = faces[0];
            const embedding = face.embedding;
            const liveness = Math.min(face.real ?? 0, face.live ?? 0);

            if (
                !embedding ||
                embedding.length !== FACE_EMBEDDING_DIM ||
                (face.faceScore ?? face.score ?? 0) < MIN_FACE_SCORE
            ) {
                // Guards both a poor capture AND a model whose embedding dim != the DB column.
                if (embedding && embedding.length !== FACE_EMBEDDING_DIM) {
                    console.error(
                        `[FaceCapture] embedding length ${embedding.length} != expected ${FACE_EMBEDDING_DIM} — model/DB mismatch`
                    );
                }
                return setStatus("low-quality");
            }

            onCapture({ embedding, liveness });
            setStatus("captured");
            stopCamera();
        } catch (err) {
            console.error("[FaceCapture] detect failed", err);
            setStatus("error");
        }
    }, [onCapture, stopCamera]);

    return (
        <div className="flex flex-col gap-2">
            <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    className={active ? "h-full w-full object-cover" : "hidden"}
                />
                {!active && (
                    <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                        {label ?? "Face capture"}
                    </div>
                )}
            </div>

            <p
                className={`text-sm ${
                    status === "captured"
                        ? "text-green-600"
                        : status === "error" || status === "low-quality" || status === "multi-face"
                          ? "text-red-600"
                          : "text-slate-600"
                }`}
            >
                {STATUS_TEXT[status]}
            </p>
            {status === "error" && errorDetail && (
                <p className="text-xs text-red-600">{errorDetail}</p>
            )}

            <div className="flex gap-2">
                {!active ? (
                    <button
                        type="button"
                        onClick={startCamera}
                        disabled={disabled || status === "loading"}
                        className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {status === "captured" ? "Recapture" : "Start camera"}
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={capture}
                            disabled={disabled || status === "detecting"}
                            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                            Capture face
                        </button>
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                        >
                            Cancel
                        </button>
                    </>
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
            return "No camera was found on this device.";
        case "NotReadableError":
            return "The camera is busy in another app (close Teams/Zoom/Camera), then retry.";
        default:
            return "Could not start the camera or load the face model — see the browser console.";
    }
}

/** Minimal shape we read off Human's FaceResult. */
interface FaceLike {
    embedding?: number[];
    real?: number;
    live?: number;
    score?: number;
    faceScore?: number;
}
