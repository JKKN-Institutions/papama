"use client";

import { useEffect } from "react";

/**
 * Landing-page motion (Pastel v2) — a faithful port of the mockup's DCLogic
 * componentDidMount, run once on mount:
 *   - reveal-on-scroll for [data-reveal] (honours [data-delay] ms),
 *   - count-up for [data-count] (+ optional [data-prefix], en-IN formatting),
 *   - the hero illustration fit() scaler for [data-illo] / [data-illo-stage].
 * Honours prefers-reduced-motion and degrades gracefully without
 * IntersectionObserver. Renders nothing — it only wires effects on the page.
 */
export function LandingEffects() {
    useEffect(() => {
        const reduce =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const reveals = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
        const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));

        // Hero illustration: scale the fixed 560px stage down to its column width.
        const illo = document.querySelector<HTMLElement>("[data-illo]");
        const stage = document.querySelector<HTMLElement>("[data-illo-stage]");
        let ro: ResizeObserver | undefined;
        if (illo && stage) {
            const fit = () => {
                const w = illo.clientWidth;
                const s = Math.min(1, w / 560);
                stage.style.transform = `scale(${s})`;
                illo.style.height = `${Math.round(420 * s)}px`;
            };
            fit();
            if (typeof ResizeObserver !== "undefined") {
                ro = new ResizeObserver(fit);
                ro.observe(illo);
            } else {
                window.addEventListener("resize", fit);
            }
        }

        const runCount = (el: HTMLElement) => {
            const target = parseFloat(el.getAttribute("data-count") || "0");
            const prefix = el.getAttribute("data-prefix") || "";
            if (reduce) {
                el.textContent = prefix + Math.round(target).toLocaleString("en-IN");
                return;
            }
            const dur = 1400;
            const start = performance.now();
            const step = (now: number) => {
                const t = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - t, 3);
                el.textContent = prefix + Math.round(target * eased).toLocaleString("en-IN");
                if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };

        // Prime the animated starting state.
        if (!reduce) {
            reveals.forEach((el) => {
                el.style.opacity = "0";
                el.style.transform = "translateY(28px)";
                el.style.transition =
                    "opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1)";
                el.style.transitionDelay = `${el.getAttribute("data-delay") || "0"}ms`;
            });
            counters.forEach((c) => {
                c.textContent = (c.getAttribute("data-prefix") || "") + "0";
            });
        }

        // No IntersectionObserver (or reduced motion): show everything at once.
        if (reduce || !("IntersectionObserver" in window)) {
            reveals.forEach((el) => {
                el.style.opacity = "1";
                el.style.transform = "none";
            });
            counters.forEach((c) => runCount(c));
            return () => {
                ro?.disconnect();
            };
        }

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    const el = e.target as HTMLElement;
                    el.style.opacity = "1";
                    el.style.transform = "none";
                    if (el.hasAttribute("data-count")) runCount(el);
                    io.unobserve(el);
                });
            },
            { threshold: 0.25 }
        );
        reveals.forEach((el) => io.observe(el));
        counters.forEach((c) => {
            if (!c.hasAttribute("data-reveal")) io.observe(c);
        });

        return () => {
            io.disconnect();
            ro?.disconnect();
        };
    }, []);

    return null;
}
