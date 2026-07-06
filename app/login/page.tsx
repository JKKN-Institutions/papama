"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";

import { clearDonorCache } from "@/lib/donor/auth";
import { createClient } from "@/lib/supabase/client";

/**
 * Unified pApAmA login — one pastel, tabbed screen serving every portal
 * (donor / vendor / volunteer / admin). All portals authenticate with the same
 * Supabase email+password call; the *role* lives in public.users, so the tab is
 * cosmetic (copy + signup link only). On success we honour a same-origin
 * ?redirect, otherwise we hand off to /post-login which resolves the real role
 * server-side and lands the user in the right area.
 *
 * Ported from the `public/pApAmA Login.dc` mockup. Keyframes are inlined as a
 * <style> tag rather than added to globals.css because Tailwind v4's Lightning
 * CSS strips unknown `pa-*` keyframes (same pattern as app/page.tsx).
 */

// Google OAuth is not wired yet (the Supabase Google provider is unconfigured —
// an open item). Flip this to true once the provider is set up to reveal the
// "Continue with Google" button on the donor/volunteer tabs.
const ENABLE_GOOGLE_OAUTH = false;

type Portal = "donor" | "vendor" | "volunteer" | "admin";
const PORTAL_KEYS: Portal[] = ["donor", "vendor", "volunteer", "admin"];

interface PortalDef {
    label: string;
    heading: string;
    subtitle: string;
    idLabel: string;
    idPlaceholder: string;
    cta: string;
    showAlt: boolean; // show the "Continue with Google" alt path
    footNote: string;
    footAction: string;
    footHref: string | null; // null → static text (admin is invite-only)
}

const PORTAL_DEFS: Record<Portal, PortalDef> = {
    donor: {
        label: "Donor",
        heading: "Welcome back, giver.",
        subtitle: "Sign in to sponsor meals and follow every token you have gifted.",
        idLabel: "Email",
        idPlaceholder: "you@example.com",
        cta: "Sign in to donate",
        showAlt: true,
        footNote: "New to pApAmA?",
        footAction: "Create a donor account",
        footHref: "/donor/signup",
    },
    vendor: {
        label: "Vendor",
        // Auth is email-only (vendors register with an email), so the field is an
        // email even though the stall has a vendor ID elsewhere in the app.
        heading: "Vendor sign in",
        subtitle: "Scan and redeem food tokens, track settlements, and manage your stall.",
        idLabel: "Email",
        idPlaceholder: "you@stall.in",
        cta: "Sign in to redeem",
        showAlt: false,
        footNote: "Run a food stall?",
        footAction: "Apply to become a vendor",
        footHref: "/vendor/register",
    },
    volunteer: {
        label: "Volunteer",
        heading: "Hello, helper.",
        subtitle: "Coordinate deliveries and confirm meals reached the right hands.",
        idLabel: "Email",
        idPlaceholder: "you@example.com",
        cta: "Sign in to volunteer",
        showAlt: true,
        footNote: "Want to join the field team?",
        footAction: "Register as a volunteer",
        footHref: "/volunteer/register",
    },
    admin: {
        label: "Admin",
        heading: "Programme console",
        subtitle: "Manage vendors, verify redemptions, and publish the transparency ledger.",
        idLabel: "Admin email",
        idPlaceholder: "admin@papama.org",
        cta: "Sign in securely",
        showAlt: false,
        footNote: "Access is invite-only.",
        footAction: "Contact the programme lead",
        footHref: null,
    },
};

function isPortal(v: string | null): v is Portal {
    return v === "donor" || v === "vendor" || v === "volunteer" || v === "admin";
}

const mono: React.CSSProperties = { fontFamily: "var(--font-mono), monospace" };

// Inlined keyframes + focus/hover + responsive rules (see file header note).
const PA_LOGIN_CSS = `
.pa-login *{ box-sizing:border-box; }
@keyframes pa-grad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes pa-floatA { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(18px,-26px) rotate(8deg)} }
@keyframes pa-floatC { 0%,100%{transform:translate(0,0)} 50%{transform:translate(14px,22px)} }
@keyframes pa-blink { 0%,100%{opacity:1} 50%{opacity:0.35} }
@keyframes pa-give {
  0% { opacity:0; transform:translate(-90px,-50px) rotate(-8deg); }
  3% { opacity:1; transform:translate(0,0) rotate(0deg); }
  8% { transform:translate(4px,8px) rotate(16deg); }
  13% { transform:translate(0,0) rotate(0deg); }
  17%,33% { opacity:0; transform:translate(-90px,-50px) rotate(-8deg); }
  36% { opacity:1; transform:translate(0,0) rotate(0deg); }
  41% { transform:translate(4px,8px) rotate(16deg); }
  46% { transform:translate(0,0) rotate(0deg); }
  50%,66% { opacity:0; transform:translate(-90px,-50px) rotate(-8deg); }
  69% { opacity:1; transform:translate(0,0) rotate(0deg); }
  74% { transform:translate(4px,8px) rotate(16deg); }
  79% { transform:translate(0,0) rotate(0deg); }
  83%,100% { opacity:0; transform:translate(-90px,-50px) rotate(-8deg); }
}
@keyframes pa-drop {
  0%,7% { opacity:0; transform:translateY(-8px); }
  9% { opacity:1; transform:translateY(0); }
  14% { opacity:1; transform:translateY(88px); }
  16%,40% { opacity:0; transform:translateY(-8px); }
  42% { opacity:1; transform:translateY(0); }
  47% { opacity:1; transform:translateY(88px); }
  49%,73% { opacity:0; transform:translateY(-8px); }
  75% { opacity:1; transform:translateY(0); }
  80% { opacity:1; transform:translateY(88px); }
  82%,100% { opacity:0; transform:translateY(-8px); }
}
@keyframes pa-grow1 {
  0%,14% { opacity:1; transform:scaleY(0); }
  19% { opacity:1; transform:scaleY(1.12); }
  22% { opacity:1; transform:scaleY(1); }
  45% { opacity:1; }
  49%,100% { opacity:0; transform:scaleY(1); }
}
@keyframes pa-grow2 {
  0%,47% { opacity:0; transform:scale(0); }
  52% { opacity:1; transform:scale(1.08); }
  55% { opacity:1; transform:scale(1); }
  78% { opacity:1; }
  82%,100% { opacity:0; transform:scale(1); }
}
@keyframes pa-grow3 {
  0%,78% { opacity:0; transform:scale(0); }
  83% { opacity:1; transform:scale(1.06); }
  86% { opacity:1; transform:scale(1); }
  90% { opacity:1; transform:scale(1); }
  94%,100% { opacity:0; transform:scale(0.12); }
}
@keyframes pa-fruit {
  0%,84% { opacity:0; transform:scale(0); }
  87% { opacity:1; transform:scale(1.25); }
  89% { opacity:1; transform:scale(1); }
  92%,100% { opacity:0; transform:scale(0.8); }
}
@keyframes pa-token-final {
  0%,92% { opacity:0; transform:scale(0) rotate(-40deg); }
  95% { opacity:1; transform:scale(1.18) rotate(6deg); }
  97% { opacity:1; transform:scale(1) rotate(0deg); }
  99% { opacity:1; transform:scale(1) rotate(0deg); }
  100% { opacity:0; transform:scale(0.8) rotate(0deg); }
}
@keyframes pa-token-ring {
  0%,93% { opacity:0; transform:scale(0.4); }
  96% { opacity:0.6; transform:scale(1); }
  100% { opacity:0; transform:scale(1.8); }
}
.pa-btn { transition: transform .2s ease, box-shadow .3s ease; cursor:pointer; }
.pa-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(47,107,81,0.22); }
.pa-input:focus { outline:none; border-color:#4c9d78 !important; box-shadow:0 0 0 3px rgba(76,157,120,0.18); }
@media (max-width: 880px) {
  .pa-login-grid { grid-template-columns: 1fr !important; }
  .pa-brand { display: none !important; }
}
@media (prefers-reduced-motion: reduce) {
  .pa-login *, .pa-login *::before, .pa-login *::after { animation: none !important; }
}
`;

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Only accept same-origin relative paths — reject `//evil.com` and absolute
    // URLs so ?redirect can't be abused as an open-redirect phishing vector.
    const rawRedirect = searchParams.get("redirect");
    const redirectTo =
        rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
            ? rawRedirect
            : null;

    const initialPortal = useMemo<Portal>(() => {
        const p = searchParams.get("portal");
        return isPortal(p) ? p : "donor";
    }, [searchParams]);

    const [portal, setPortal] = useState<Portal>(initialPortal);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const stageRef = useRef<HTMLDivElement | null>(null);
    const replay = () => {
        const el = stageRef.current;
        if (el && "getAnimations" in el) {
            el.getAnimations({ subtree: true }).forEach((a) => (a.currentTime = 0));
        }
    };

    const d = PORTAL_DEFS[portal];

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        clearDonorCache(); // drop any stale donor identity from a previous session
        // Explicit ?redirect wins (deep-link return); otherwise let /post-login
        // resolve the real role and route there.
        router.push(redirectTo ?? "/post-login");
        router.refresh();
    }

    return (
        <div
            className="pa-login"
            style={{ fontFamily: "var(--font-sans), sans-serif", color: "#33463c" }}
        >
            <style dangerouslySetInnerHTML={{ __html: PA_LOGIN_CSS }} />
            <div
                className="pa-login-grid"
                style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}
            >
                {/* LEFT: animated brand panel */}
                <div
                    className="pa-brand"
                    style={{
                        position: "relative",
                        overflow: "hidden",
                        background:
                            "linear-gradient(140deg, #dff2e6, #c4e5d2, #d9f0e2, #cfeadb)",
                        backgroundSize: "300% 300%",
                        animation: "pa-grad 18s ease infinite",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: "48px 56px",
                    }}
                >
                    <div style={{ position: "absolute", top: "12%", right: "10%", width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.5)", animation: "pa-floatA 10s ease-in-out infinite" }} />
                    <div style={{ position: "absolute", bottom: "18%", left: "8%", width: 70, height: 70, borderRadius: "50%", border: "2px solid rgba(60,138,104,0.25)", animation: "pa-floatC 11s ease-in-out infinite" }} />
                    <div style={{ position: "absolute", top: "48%", right: "22%", width: 40, height: 40, borderRadius: 12, background: "rgba(140,200,168,0.35)", animation: "pa-floatA 8s ease-in-out infinite" }} />

                    <Link
                        href="/"
                        style={{ position: "relative", fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "#2f6b51", textDecoration: "none" }}
                    >
                        pApAmA
                    </Link>

                    <div style={{ position: "relative" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,0.65)", ...mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", padding: "8px 16px", borderRadius: 999, marginBottom: 24, color: "#2f6b51" }}>
                            <span style={{ width: 8, height: 8, background: "#4c9d78", borderRadius: 999, display: "inline-block", animation: "pa-blink 1.6s ease-in-out infinite" }} />
                            Transparent food giving
                        </div>
                        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "#264434", maxWidth: 420 }}>
                            Every gift traced to the plate it becomes.
                        </div>
                        <p style={{ fontSize: 16, lineHeight: 1.6, color: "#4f6a5c", maxWidth: 400, margin: "18px 0 0" }}>
                            Sign in to your portal to donate, redeem tokens, coordinate deliveries, or run the programme.
                        </p>

                        {/* small amount, big impact: coin → seed → plant → tree → token */}
                        <div
                            ref={stageRef}
                            onClick={replay}
                            title="Click to replay"
                            style={{ position: "relative", width: 400, height: 218, marginTop: 30, cursor: "pointer" }}
                        >
                            <div style={{ position: "absolute", left: "50%", top: 0, width: 560, height: 300, marginLeft: -280, transform: "scale(0.714)", transformOrigin: "top center" }}>
                                {/* soil */}
                                <div style={{ position: "absolute", left: 220, top: 224, width: 120, height: 26, background: "rgba(255,255,255,0.65)", borderRadius: 999 }} />

                                {/* giving hand + coin */}
                                <div style={{ position: "absolute", left: 140, top: 52, animation: "pa-give 13s ease-in-out infinite" }}>
                                    <div style={{ position: "relative", width: 120, height: 64 }}>
                                        <svg width="120" height="64" viewBox="0 0 120 64" fill="none">
                                            <rect x="0" y="26" width="30" height="26" rx="7" fill="#2f6b51" />
                                            <path d="M26 30 C26 24 32 21 38 21 L84 21 C88 21 91 24 91 27 C91 30 88 33 84 33 L70 33 L86 33 C90 33 93 36 93 39 C93 42 90 45 86 45 L70 45 L82 45 C85.5 45 88 47.5 88 50 C88 52.5 85.5 55 82 55 L48 55 C36 55 26 48 26 38 Z" fill="#4c9d78" />
                                            <path d="M46 21 C42 14 46 8 52 8 C57 8 60 12 60 17 L60 21 Z" fill="#4c9d78" />
                                        </svg>
                                        <div style={{ position: "absolute", left: 58, top: -8, width: 28, height: 28, borderRadius: 999, background: "#fff", border: "2.5px solid #2f6b51", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#2f6b51", boxShadow: "0 4px 10px rgba(47,107,81,0.2)" }}>₹</div>
                                    </div>
                                </div>
                                {/* falling coin */}
                                <div style={{ position: "absolute", left: 266, top: 118, animation: "pa-drop 13s ease-in infinite" }}>
                                    <div style={{ width: 26, height: 26, borderRadius: 999, background: "#fff", border: "2px solid #4c9d78", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#2f6b51" }}>₹</div>
                                </div>

                                {/* stage 1: sprout */}
                                <div style={{ position: "absolute", left: 250, top: 170, width: 60, height: 64, transformOrigin: "bottom center", animation: "pa-grow1 13s ease-in-out infinite" }}>
                                    <div style={{ position: "absolute", left: 28, bottom: 0, width: 4, height: 34, background: "#2f6b51", borderRadius: 4 }} />
                                    <div style={{ position: "absolute", left: 8, bottom: 26, width: 20, height: 12, background: "#4c9d78", borderRadius: "0 12px 0 12px", transform: "rotate(-16deg)" }} />
                                    <div style={{ position: "absolute", left: 32, bottom: 26, width: 20, height: 12, background: "#6fb893", borderRadius: "12px 0 12px 0", transform: "rotate(16deg)" }} />
                                </div>

                                {/* stage 2: plant */}
                                <div style={{ position: "absolute", left: 240, top: 120, width: 80, height: 114, transformOrigin: "bottom center", animation: "pa-grow2 13s ease-in-out infinite" }}>
                                    <div style={{ position: "absolute", left: 38, bottom: 0, width: 5, height: 74, background: "#2f6b51", borderRadius: 4 }} />
                                    <div style={{ position: "absolute", left: 12, bottom: 60, width: 24, height: 14, background: "#4c9d78", borderRadius: "0 14px 0 14px", transform: "rotate(-18deg)" }} />
                                    <div style={{ position: "absolute", left: 44, bottom: 60, width: 24, height: 14, background: "#6fb893", borderRadius: "14px 0 14px 0", transform: "rotate(18deg)" }} />
                                    <div style={{ position: "absolute", left: 16, bottom: 34, width: 22, height: 13, background: "#8cc8a8", borderRadius: "0 13px 0 13px", transform: "rotate(-24deg)" }} />
                                    <div style={{ position: "absolute", left: 42, bottom: 34, width: 22, height: 13, background: "#4c9d78", borderRadius: "13px 0 13px 0", transform: "rotate(24deg)" }} />
                                </div>

                                {/* stage 3: tree */}
                                <div style={{ position: "absolute", left: 210, top: 56, width: 140, height: 178, transformOrigin: "bottom center", animation: "pa-grow3 13s ease-in-out infinite" }}>
                                    <svg width="140" height="178" viewBox="0 0 140 178" fill="none">
                                        <path d="M66 178 L66 110 L44 88 L48 84 L66 100 L66 78 L74 78 L74 92 L94 74 L98 78 L74 102 L74 178 Z" fill="#2f6b51" />
                                        <ellipse cx="70" cy="52" rx="54" ry="44" fill="#4c9d78" />
                                        <circle cx="32" cy="72" r="26" fill="#4c9d78" />
                                        <circle cx="108" cy="70" r="24" fill="#4c9d78" />
                                        <circle cx="52" cy="36" r="16" fill="#6fb893" />
                                        <circle cx="92" cy="46" r="12" fill="#6fb893" />
                                    </svg>
                                    <div style={{ position: "absolute", left: 38, top: 52, width: 14, height: 14, borderRadius: 999, background: "#e9f7ee", animation: "pa-fruit 13s ease-in-out infinite" }} />
                                    <div style={{ position: "absolute", left: 88, top: 32, width: 12, height: 12, borderRadius: 999, background: "#e9f7ee", animation: "pa-fruit 13s ease-in-out infinite", animationDelay: ".2s" }} />
                                    <div style={{ position: "absolute", left: 66, top: 70, width: 11, height: 11, borderRadius: 999, background: "#e9f7ee", animation: "pa-fruit 13s ease-in-out infinite", animationDelay: ".4s" }} />
                                </div>

                                {/* final beat: the tree becomes a food token */}
                                <div style={{ position: "absolute", left: 244, top: 104, width: 72, height: 72, borderRadius: 999, border: "3px solid #2f6b51", animation: "pa-token-ring 13s ease-out infinite" }} />
                                <div style={{ position: "absolute", left: 244, top: 104, width: 72, height: 72, animation: "pa-token-final 13s ease-in-out infinite" }}>
                                    <div style={{ width: 72, height: 72, borderRadius: 999, background: "#fff", border: "3px solid #2f6b51", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 24px rgba(47,107,81,0.25)" }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: "#2f6b51", lineHeight: 1 }}>₹</div>
                                        <div style={{ ...mono, fontSize: 7, letterSpacing: "0.12em", color: "#4c9d78", marginTop: 3 }}>FOOD TOKEN</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ position: "relative", ...mono, fontSize: 12, letterSpacing: "0.08em", color: "#4f7a63" }}>
                        TOKENS ARE FOOD-VALUE ONLY · NEVER CASH
                    </div>
                </div>

                {/* RIGHT: login form */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, background: "#f2f9f4" }}>
                    <div style={{ width: "100%", maxWidth: 440 }}>
                        {/* portal tabs */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, background: "#e3f0e8", borderRadius: 999, padding: 6, marginBottom: 36 }}>
                            {PORTAL_KEYS.map((key) => {
                                const active = key === portal;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => {
                                            setPortal(key);
                                            setError(null);
                                        }}
                                        className="pa-btn"
                                        style={{
                                            textAlign: "center",
                                            fontSize: 13.5,
                                            fontFamily: "inherit",
                                            fontWeight: active ? 700 : 500,
                                            padding: "9px 0",
                                            border: "none",
                                            borderRadius: 999,
                                            background: active ? "#ffffff" : "transparent",
                                            color: active ? "#2f6b51" : "#6f8378",
                                            boxShadow: active ? "0 3px 10px rgba(47,107,81,0.14)" : "none",
                                        }}
                                    >
                                        {PORTAL_DEFS[key].label}
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.025em", color: "#264434" }}>{d.heading}</div>
                        <p style={{ fontSize: 15, color: "#6f8378", margin: "8px 0 32px", lineHeight: 1.55 }}>{d.subtitle}</p>

                        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                            <div>
                                <label htmlFor="pa-email" style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#4f6a5c", marginBottom: 8 }}>{d.idLabel}</label>
                                <input
                                    id="pa-email"
                                    className="pa-input"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={d.idPlaceholder}
                                    style={{ width: "100%", fontFamily: "var(--font-sans), sans-serif", fontSize: 15, padding: "14px 18px", border: "1.5px solid #d5e6db", borderRadius: 14, background: "#fbfdfc", color: "#264434", transition: "border-color .2s ease, box-shadow .2s ease" }}
                                />
                            </div>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                    <label htmlFor="pa-password" style={{ fontSize: 13.5, fontWeight: 600, color: "#4f6a5c" }}>Password</label>
                                    <Link href="/forgot-password" style={{ fontSize: 13, fontWeight: 600, color: "#3c8a68", textDecoration: "none" }}>Forgot?</Link>
                                </div>
                                <input
                                    id="pa-password"
                                    className="pa-input"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    style={{ width: "100%", fontFamily: "var(--font-sans), sans-serif", fontSize: 15, padding: "14px 18px", border: "1.5px solid #d5e6db", borderRadius: 14, background: "#fbfdfc", color: "#264434", transition: "border-color .2s ease, box-shadow .2s ease" }}
                                />
                            </div>

                            {error && (
                                <p role="alert" style={{ margin: 0, fontSize: 14, color: "#b42318", background: "#fdeceb", border: "1px solid #f6cfca", borderRadius: 12, padding: "12px 16px" }}>
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="pa-btn"
                                style={{ background: "#3c8a68", color: "#f7fcf9", fontSize: 16, fontWeight: 700, fontFamily: "inherit", padding: 16, border: "none", borderRadius: 999, textAlign: "center", marginTop: 6, opacity: loading ? 0.65 : 1, cursor: loading ? "not-allowed" : "pointer" }}
                            >
                                {loading ? "Signing in…" : d.cta}
                            </button>
                        </form>

                        {ENABLE_GOOGLE_OAUTH && d.showAlt && (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "26px 0" }}>
                                    <div style={{ flex: 1, height: 1, background: "#dcebe2" }} />
                                    <span style={{ fontSize: 12.5, color: "#8ba396" }}>or</span>
                                    <div style={{ flex: 1, height: 1, background: "#dcebe2" }} />
                                </div>
                                <button type="button" className="pa-btn" style={{ width: "100%", border: "1.5px solid #d5e6db", background: "#fff", color: "#33463c", fontSize: 15, fontWeight: 600, fontFamily: "inherit", padding: 14, borderRadius: 999, textAlign: "center" }}>
                                    Continue with Google
                                </button>
                            </>
                        )}

                        <p style={{ fontSize: 14, color: "#6f8378", textAlign: "center", marginTop: 30 }}>
                            {d.footNote}{" "}
                            {d.footHref ? (
                                <Link href={d.footHref} style={{ color: "#3c8a68", fontWeight: 700, textDecoration: "none" }}>{d.footAction}</Link>
                            ) : (
                                <span style={{ color: "#3c8a68", fontWeight: 700 }}>{d.footAction}</span>
                            )}
                        </p>

                        {portal === "admin" && (
                            <div style={{ marginTop: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, ...mono, fontSize: 11.5, letterSpacing: "0.08em", color: "#8ba396" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8ba396" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="4" y="10" width="16" height="10" rx="2" />
                                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                                </svg>
                                RESTRICTED ACCESS · ALL ACTIONS ARE AUDIT-LOGGED
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
