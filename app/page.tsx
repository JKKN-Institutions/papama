import Link from "next/link";

import { LandingEffects } from "@/components/ui/LandingEffects";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransparencyStats, type TransparencyStats } from "@/lib/services/transparency";

/**
 * pApAmA landing page — "Pastel v2" design (ported from
 * public/pApAmA Home Pastel v2.dc.html) wired to live data + real routes.
 * Light-only art direction. Animations live in the injected <style> (Tailwind v4
 * drops these keyframes from globals.css) and are driven by <LandingEffects/>.
 * Compact type/spacing pass so sections don't feel oversized.
 */
export const dynamic = "force-dynamic";

const ZERO: TransparencyStats = {
    total_donations_inr: 0,
    meals_sponsored: 0,
    meals_served: 0,
    active_vendors: 0,
    active_beneficiaries: 0,
    cities_covered: 0,
};

const fmt = (n: number) => n.toLocaleString("en-IN");
// Accent style for eyebrows / labels / captions. Per request, this uses the same
// Poppins face as the header nav across ALL sections (previously a monospace font).
const mono = { fontFamily: "var(--font-sans), sans-serif" } as const;

/**
 * Landing animation CSS, injected as a real <style> tag (Tailwind v4's Lightning
 * CSS drops these `pa-*` keyframes/classes when they live in globals.css, so we
 * ship them inline — the same approach the original mockup used).
 */
const PA_CSS = `
@keyframes pa-grad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes pa-floatA { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(18px,-26px) rotate(8deg)} }
@keyframes pa-floatC { 0%,100%{transform:translate(0,0)} 50%{transform:translate(14px,22px)} }
@keyframes pa-pulse { 0%{box-shadow:0 0 0 0 rgba(76,157,120,0.45)} 70%{box-shadow:0 0 0 14px rgba(76,157,120,0)} 100%{box-shadow:0 0 0 0 rgba(76,157,120,0)} }
@keyframes pa-blink { 0%,100%{opacity:1} 50%{opacity:0.35} }
@keyframes pa-marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes pa-rise { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
@keyframes pa-chop {
  0%, 8% { transform: rotate(-30deg) translate(0,0); }
  15% { transform: rotate(-4deg) translate(6px,46px); }
  22% { transform: rotate(-26deg) translate(2px,6px); }
  32%, 58% { transform: rotate(-30deg) translate(0,0); }
  64% { transform: rotate(-22deg) translate(0,-6px); }
  70% { transform: rotate(-36deg) translate(0,0); }
  76% { transform: rotate(-26deg) translate(0,-4px); }
  82%, 100% { transform: rotate(-30deg) translate(0,0); }
}
@keyframes pa-thanks {
  0%, 58% { opacity: 0; transform: scale(0) translateY(10px); }
  64% { opacity: 1; transform: scale(1.15) translateY(0); }
  70% { opacity: 1; transform: scale(1) translateY(0); }
  86% { opacity: 1; transform: scale(1) translateY(-4px); }
  94%, 100% { opacity: 0; transform: scale(0.7) translateY(-14px); }
}
@keyframes pa-slice {
  0%, 15% { opacity: 1; transform: translate(0,0) rotate(0deg); }
  24% { transform: translate(30px,-16px) rotate(12deg); }
  54% { transform: translate(230px,40px) rotate(80deg); }
  60%, 84% { opacity: 1; transform: translate(238px,54px) rotate(90deg); }
  92% { opacity: 0; transform: translate(238px,54px) rotate(90deg); }
  97% { opacity: 0; transform: translate(0,0) rotate(0deg); }
  100% { opacity: 1; transform: translate(0,0) rotate(0deg); }
}
.pa-hero-word { animation: pa-rise .9s cubic-bezier(.22,1,.36,1) both; }
.pa-hero-d1 { animation-delay: .1s; }
.pa-hero-d2 { animation-delay: .22s; }
.pa-hero-d3 { animation-delay: .34s; }
.pa-hero-d4 { animation-delay: .46s; }
.pa-card { transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease; }
.pa-card:hover { transform: translateY(-5px); box-shadow: 0 14px 32px rgba(76,140,105,0.16); }
.pa-btn { transition: transform .2s ease, box-shadow .3s ease; }
.pa-btn:hover { transform: translateY(-2px); }
.pa-nav a { position: relative; text-decoration: none; color: inherit; }
.pa-nav a::after { content:''; position:absolute; left:0; bottom:-5px; height:2px; width:0; background:#4c9d78; transition: width .28s ease; }
.pa-nav a:hover::after { width:100%; }
.pa-portal { transition: transform .28s ease, background .28s ease; }
.pa-portal:hover { transform: translateY(-4px); background:#e3f4e9; }
.pa-portal:hover .pa-arrow { transform: translateX(6px); }
.pa-arrow { display:inline-block; transition: transform .28s ease; }
#impact, #how { scroll-margin-top: 76px; }
@media (max-width: 860px) {
  .pa-hero-grid { grid-template-columns: 1fr !important; }
  .pa-illo { display: none !important; }
  .pa-grid3 { grid-template-columns: repeat(2, 1fr) !important; }
  .pa-grid4 { grid-template-columns: repeat(2, 1fr) !important; }
  .pa-nav-links { display: none !important; }
  .pa-pad { padding-left: 20px !important; padding-right: 20px !important; }
  .pa-hero-h1 { font-size: 38px !important; }
  .pa-footcols { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
  .pa-trust { gap: 12px !important; }
}
`;

export default async function Home() {
    const stats = await getTransparencyStats(createAdminClient()).catch(() => null);
    const s = stats ?? ZERO;

    const cards: { value: number; prefix?: string; label: string; icon: React.ReactNode }[] = [
        { value: s.total_donations_inr, prefix: "₹", label: "Donated", icon: <IconHeart /> },
        { value: s.meals_sponsored, label: "Meals sponsored", icon: <IconBowl /> },
        { value: s.meals_served, label: "Meals served", icon: <IconTarget /> },
        { value: s.active_beneficiaries, label: "Beneficiaries reached", icon: <IconUser /> },
        { value: s.active_vendors, label: "Active vendors", icon: <IconStore /> },
        { value: s.cities_covered, label: "Cities covered", icon: <IconPin /> },
    ];

    return (
        <div style={{ fontFamily: "var(--font-sans), sans-serif", color: "#2c3a33", overflowX: "hidden", background: "#ffffff" }}>
            <style dangerouslySetInnerHTML={{ __html: PA_CSS }} />

            {/* nav */}
            <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid #edf1ef" }}>
                <div className="pa-nav pa-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 48px", maxWidth: 1200, margin: "0 auto" }}>
                    <Link href="/" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#0B7A55", textDecoration: "none" }}>pApAmA</Link>
                    <div className="pa-nav-links" style={{ display: "flex", gap: 32, fontSize: 14, fontWeight: 600, color: "#4c5f54" }}>
                        <Link href="#impact">Impact</Link>
                        <Link href="#how">How it works</Link>
                        <Link href="/login?portal=vendor">Vendors</Link>
                        <Link href="/login?portal=volunteer">Volunteer</Link>
                    </div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: "#4c5f54", textDecoration: "none" }}>Portal login</Link>
                        <Link href="/donate" className="pa-btn" style={{ background: "#0B7A55", color: "#fff", fontSize: 14, fontWeight: 700, padding: "9px 18px", borderRadius: 8, textDecoration: "none" }}>Donate</Link>
                    </div>
                </div>
            </header>

            {/* HERO */}
            <div className="pa-pad" style={{ position: "relative", margin: "10px 20px 0", borderRadius: 28, overflow: "hidden", background: "linear-gradient(130deg, #e3f4e9, #cfeadb, #dff2e6, #c4e5d2, #e3f4e9)", backgroundSize: "300% 300%", animation: "pa-grad 18s ease infinite", maxWidth: 1200, marginLeft: "auto", marginRight: "auto" }}>
                <div style={{ position: "absolute", top: "10%", left: "6%", width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.55)", animation: "pa-floatA 9s ease-in-out infinite" }} />
                <div style={{ position: "absolute", top: "64%", left: "10%", width: 46, height: 46, borderRadius: "50%", border: "2px solid rgba(60,138,104,0.25)", animation: "pa-floatC 11s ease-in-out infinite" }} />
                <div style={{ position: "absolute", top: "14%", right: "6%", width: 104, height: 104, borderRadius: "50%", background: "rgba(140,200,168,0.3)", animation: "pa-floatA 10s ease-in-out infinite" }} />

                <div className="pa-hero-grid" style={{ position: "relative", padding: "52px 52px 56px", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 32, alignItems: "center" }}>
                    <div>
                        <div className="pa-hero-word pa-hero-d1" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.65)", ...mono, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", padding: "6px 13px", borderRadius: 999, marginBottom: 18, color: "#2f6b51" }}>
                            <span style={{ width: 7, height: 7, background: "#4c9d78", borderRadius: 999, display: "inline-block", animation: "pa-blink 1.6s ease-in-out infinite" }} /> Transparent food giving
                        </div>
                        <h1 className="pa-hero-word pa-hero-d2 pa-hero-h1" style={{ fontSize: 52, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.035em", margin: "0 0 4px", color: "#264434" }}>Give a meal.</h1>
                        <h1 className="pa-hero-word pa-hero-d3 pa-hero-h1" style={{ fontSize: 52, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.035em", margin: "0 0 18px", color: "#4c9d78" }}>Follow it home.</h1>
                        <p className="pa-hero-word pa-hero-d3" style={{ fontSize: 16, lineHeight: 1.55, color: "#4f6a5c", maxWidth: 480, margin: "0 0 26px" }}>Your donation becomes a tamper-proof food token — never cash, never withdrawable — so you can trace your gift all the way to the plate it becomes.</p>
                        <div className="pa-hero-word pa-hero-d4" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <Link href="/donate" className="pa-btn" style={{ background: "#3c8a68", color: "#f7fcf9", fontSize: 15, fontWeight: 700, padding: "13px 24px", borderRadius: 999, animation: "pa-pulse 2.6s infinite", textDecoration: "none" }}>Sponsor a meal <span className="pa-arrow">→</span></Link>
                            <Link href="/transparency" className="pa-btn" style={{ background: "rgba(255,255,255,0.75)", color: "#2f6b51", fontSize: 15, fontWeight: 600, padding: "13px 24px", borderRadius: 999, border: "1px solid rgba(60,138,104,0.25)", textDecoration: "none" }}>See our impact</Link>
                        </div>
                    </div>

                    {/* card-slices-bread illustration */}
                    <div className="pa-hero-word pa-hero-d4 pa-illo" data-illo style={{ position: "relative", height: 330 }}>
                        <div data-illo-stage style={{ position: "absolute", left: "50%", top: 0, width: 560, height: 420, marginLeft: -280, transformOrigin: "top center" }}>
                            <div style={{ position: "absolute", left: "8%", bottom: 88, width: 300, height: 22, background: "#a8d4bb", borderRadius: 12 }} />
                            <div style={{ position: "absolute", left: "12%", bottom: 108, width: 190, height: 110, background: "#bfe3cc", borderRadius: "54px 54px 18px 18px", boxShadow: "inset 0 -14px 0 rgba(60,138,104,0.14)" }} />
                            <div style={{ position: "absolute", left: "12%", bottom: 108, width: 190, height: 110, borderRadius: "54px 54px 18px 18px", background: "repeating-linear-gradient(90deg, transparent 0 44px, rgba(60,138,104,0.18) 44px 46px)" }} />
                            <div style={{ position: "absolute", left: "calc(12% + 186px)", bottom: 108, width: 44, height: 104, animation: "pa-slice 6s ease-in-out infinite" }}>
                                <div style={{ width: "100%", height: "100%", background: "#d9f0e2", border: "2px solid #8cc8a8", borderRadius: "20px 20px 8px 8px" }} />
                            </div>
                            <div style={{ position: "absolute", left: "calc(12% + 168px)", bottom: 196, width: 150, height: 94, transformOrigin: "10% 90%", animation: "pa-chop 6s ease-in-out infinite" }}>
                                <div style={{ width: "100%", height: "100%", background: "#2f6b51", borderRadius: 12, padding: 12, color: "#d9f0e2" }}>
                                    <div style={{ width: 30, height: 20, background: "#8cc8a8", borderRadius: 4 }} />
                                    <div style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", marginTop: 14 }}>FOOD TOKEN</div>
                                    <div style={{ ...mono, fontSize: 11, letterSpacing: "0.16em", marginTop: 4 }}>•••• 0850</div>
                                </div>
                            </div>
                            <div style={{ position: "absolute", right: "2%", bottom: 84, width: 130, height: 16, background: "#fff", borderRadius: 999, boxShadow: "0 4px 0 #a8d4bb" }} />
                            <div style={{ position: "absolute", right: "1%", bottom: 150, animation: "pa-thanks 6s ease-in-out infinite", transformOrigin: "bottom center" }}>
                                <div style={{ position: "relative", background: "#fff", border: "2px solid #8cc8a8", borderRadius: 16, padding: "10px 16px", fontWeight: 700, fontSize: 15, color: "#2f6b51", boxShadow: "0 8px 20px rgba(47,107,81,0.15)", whiteSpace: "nowrap" }}>
                                    Thank you! 💚
                                    <div style={{ position: "absolute", left: 32, bottom: -8, width: 14, height: 14, background: "#fff", borderRight: "2px solid #8cc8a8", borderBottom: "2px solid #8cc8a8", transform: "rotate(45deg)" }} />
                                </div>
                            </div>
                            <div style={{ position: "absolute", left: 0, right: 0, bottom: 8, textAlign: "center", ...mono, fontSize: 12, letterSpacing: "0.1em", color: "#4f7a63" }}>YOUR TOKEN SLICES THE LOAF · A SHARE REACHES A PLATE</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* credibility strip */}
            <div className="pa-pad" style={{ maxWidth: 1200, margin: "22px auto 0", padding: "0 52px" }}>
                <div className="pa-trust" style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", borderTop: "1px solid #eef2f0", borderBottom: "1px solid #eef2f0", padding: "16px 0" }}>
                    {["Tamper-proof tokens", "Verified vendors", "Public redemption ledger", "Never cash — food value only"].map((t) => (
                        <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#3f5349" }}>
                            <IconCheck /> {t}
                        </div>
                    ))}
                </div>
            </div>

            {/* LIVE IMPACT */}
            <div id="impact" className="pa-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 52px 28px" }}>
                <div data-reveal style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
                    <div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", color: "#0B7A55", textTransform: "uppercase", marginBottom: 8 }}>Our impact, live</div>
                        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", margin: 0, color: "#14342a" }}>Real numbers, updated as it happens.</h2>
                    </div>
                    <span style={{ fontSize: 12, color: "#8ba396", alignSelf: "flex-end" }}>Programme-wide totals · no PII shown</span>
                </div>

                <div className="pa-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                    {cards.map((c, i) => (
                        <div key={c.label} className="pa-card" data-reveal data-delay={String(i * 60)} style={{ background: "#fff", border: "1px solid #e7ede9", borderRadius: 12, padding: "22px 22px", boxShadow: "0 1px 2px rgba(16,40,32,0.04)" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eaf5ef", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.icon}</div>
                            <div data-count={String(c.value)} {...(c.prefix ? { "data-prefix": c.prefix } : {})} style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: i === 0 ? "#0B7A55" : "#14342a" }}>
                                {c.prefix ?? ""}{fmt(c.value)}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b8078", marginTop: 10 }}>{c.label}</div>
                        </div>
                    ))}
                </div>
                <div data-reveal style={{ marginTop: 20, textAlign: "center" }}>
                    <Link href="/transparency" style={{ fontSize: 14.5, fontWeight: 700, color: "#0B7A55", textDecoration: "none" }}>View full transparency dashboard <span className="pa-arrow">→</span></Link>
                </div>
            </div>

            {/* HOW IT WORKS */}
            <div id="how" style={{ background: "#f7faf8", borderTop: "1px solid #eef2f0", borderBottom: "1px solid #eef2f0" }}>
                <div className="pa-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "52px 52px" }}>
                    <div data-reveal style={{ textAlign: "center", marginBottom: 32 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", color: "#0B7A55", textTransform: "uppercase", marginBottom: 10 }}>How it works</div>
                        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", margin: 0, color: "#14342a" }}>How a token becomes a meal</h2>
                    </div>
                    <div className="pa-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
                        {[
                            { n: "01", t: "You give", d: "Your donation is converted into food tokens pegged to real meal value." },
                            { n: "02", t: "Token issued", d: "Each token is tamper-proof and tracked — food value only, never cash." },
                            { n: "03", t: "Vendor redeems", d: "A verified vendor scans the token and prepares a fresh meal against it." },
                            { n: "04", t: "Meal served", d: "The redemption is logged to the public ledger — closing the loop on your gift." },
                        ].map((step, i) => {
                            const done = i === 3;
                            return (
                                <div key={step.n} className="pa-card" data-reveal data-delay={String(i * 90)} style={{ background: "#fff", border: "1px solid #e7ede9", borderRadius: 12, padding: 22, boxShadow: "0 1px 2px rgba(16,40,32,0.04)" }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 999, background: done ? "#0B7A55" : "#eaf5ef", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: done ? "#fff" : "#0B7A55" }}>{step.n}</div>
                                    <div style={{ fontWeight: 700, fontSize: 16, margin: "12px 0 6px", color: "#14342a" }}>{step.t}</div>
                                    <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#647a70" }}>{step.d}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* PORTALS */}
            <div className="pa-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 52px 56px" }}>
                <div data-reveal style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", color: "#8ba396", textTransform: "uppercase", marginBottom: 16 }}>Choose your portal</div>
                <div className="pa-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
                    {[
                        { title: "Donor", cta: "Open dashboard", href: "/donor/dashboard" },
                        { title: "Vendor", cta: "Sign in or apply", href: "/login?portal=vendor" },
                        { title: "Volunteer", cta: "Sign in", href: "/login?portal=volunteer" },
                        { title: "Admin", cta: "Sign in", href: "/login?portal=admin" },
                    ].map((p, i) => (
                        <Link key={p.title} href={p.href} className="pa-portal" data-reveal data-delay={String(i * 80)} style={{ background: "#fff", border: "1px solid #e7ede9", borderRadius: 12, padding: 20, cursor: "pointer", textDecoration: "none", display: "block", boxShadow: "0 1px 2px rgba(16,40,32,0.04)" }}>
                            <div style={{ fontWeight: 700, fontSize: 16, color: "#14342a" }}>{p.title}</div>
                            <div style={{ fontSize: 13, color: "#6b8078", marginTop: 5 }}>{p.cta} <span className="pa-arrow" style={{ color: "#0B7A55" }}>→</span></div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* FOOTER */}
            <footer style={{ background: "#0f3d2e", color: "#cfe3d8" }}>
                <div className="pa-footcols pa-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 52px 24px", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 32 }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>pApAmA</div>
                        <div style={{ fontSize: 13.5, color: "#9dc3b2", marginTop: 10, maxWidth: 320, lineHeight: 1.6 }}>
                            Turn donations into meals — fund, distribute, redeem and settle tamper-proof food tokens, fully traceable from gift to plate.
                        </div>
                    </div>
                    <FooterCol title="Platform" links={[["Impact", "#impact"], ["How it works", "#how"], ["Donate", "/donate"]]} />
                    <FooterCol title="Get involved" links={[["Donor", "/donor/dashboard"], ["Vendors", "/login?portal=vendor"], ["Volunteer", "/login?portal=volunteer"]]} />
                    <FooterCol title="Trust" links={[["Transparency", "/transparency"], ["Portal login", "/login"]]} />
                </div>
                <div className="pa-pad" style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 52px 40px", borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 12.5, color: "#8fb3a3" }}>
                    <span>Tokens represent food value only — never cash, never withdrawable.</span>
                    <span>© 2026 pApAmA</span>
                </div>
            </footer>

            <LandingEffects />
        </div>
    );
}

// --- inline icons (stroke #2f6b51), matching the mockup ----------------------
const iconProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#2f6b51",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
};
function IconHeart() {
    return <svg {...iconProps}><path d="M19 14c1.5-1.5 2-3.2 2-4.5A4.5 4.5 0 0 0 12 6.6 4.5 4.5 0 0 0 3 9.5c0 1.3.5 3 2 4.5l7 6.5z" /></svg>;
}
function IconBowl() {
    return <svg {...iconProps}><path d="M4 11h16a8 8 0 0 1-16 0z" /><path d="M9 7c0-1 .5-1.5.5-2.5M13.5 7c0-1 .5-1.5.5-2.5" /></svg>;
}
function IconTarget() {
    return <svg {...iconProps}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>;
}
function IconUser() {
    return <svg {...iconProps}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>;
}
function IconStore() {
    return <svg {...iconProps}><path d="M4 10v10h16V10" /><path d="M3 6l1.5-3h15L21 6a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-4 0 2.5 2.5 0 0 1-5 0z" /><path d="M9 20v-6h6v6" /></svg>;
}
function IconPin() {
    return <svg {...iconProps}><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
function IconCheck() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B7A55" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" stroke="#0B7A55" strokeWidth={1.6} opacity={0.35} />
            <path d="M8 12.5l2.5 2.5L16 9.5" />
        </svg>
    );
}

/** Footer link column. */
function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
    return (
        <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7fa998", marginBottom: 12 }}>{title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {links.map(([label, href]) => (
                    <Link key={label} href={href} style={{ fontSize: 13.5, color: "#cfe3d8", textDecoration: "none" }}>{label}</Link>
                ))}
            </div>
        </div>
    );
}
