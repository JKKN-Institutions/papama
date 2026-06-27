"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { NotificationItem } from "@/lib/donor/types/contract";
import { signOutDonor } from "@/lib/donor/auth";
import { createClient } from "@/lib/supabase/client";

// Initials from the signed-in email (e.g. "roja.sundharam@x" → "RS").
function initialsFromEmail(email: string | null): string {
  if (!email) return "D";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = (parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)) || "D";
  return letters.toUpperCase();
}

type IconName = "home" | "heart" | "wallet" | "ticket" | "clock" | "impact";

// Compact stroke icons for the mobile bottom bar. Inherit color via `currentColor`.
function NavIcon({ name }: { name: IconName }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 2,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 9.5 12 3l9 6.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.3-9.3-8.5C1.2 8.7 2.8 5.5 6 5.5c1.9 0 3.2 1.1 4 2.3.8-1.2 2.1-2.3 4-2.3 3.2 0 4.8 3.2 3.3 6C19 15.7 12 20 12 20Z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
          <path d="M2.5 10h19" />
          <circle cx="17" cy="14.5" r="1" />
        </svg>
      );
    case "ticket":
      return (
        <svg {...common}>
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a2 2 0 0 0 0 3.8v1.2A1.5 1.5 0 0 1 19.5 17h-15A1.5 1.5 0 0 1 3 15.5v-1.2a2 2 0 0 0 0-3.8Z" />
          <path d="M12 7v10" strokeDasharray="2 2.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 1.8" />
        </svg>
      );
    case "impact":
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 16l4.5-4.5 3.5 3.5L20 7" />
          <path d="M16 7h4v4" />
        </svg>
      );
  }
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [credits, setCredits] = useState<{ credit_balance: number } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  async function loadNavbarData() {
    try {
      const [creditsRes, notificationsRes] = await Promise.all([
        ApiClient.getCredits(),
        ApiClient.getNotifications(),
      ]);
      setCredits(creditsRes);
      setNotifications(notificationsRes.notifications);
    } catch (error) {
      console.warn("Error loading navbar details:", error);
    }
  }

  useEffect(() => {
    loadNavbarData();

    // Resolve the signed-in donor's email for the initials avatar.
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null));

    // Set up custom event listener for real-time visual updates
    window.addEventListener("papama_data_update", loadNavbarData);
    return () => {
      window.removeEventListener("papama_data_update", loadNavbarData);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSignOut = async () => {
    await signOutDonor();
    router.push("/donor/login");
    router.refresh();
  };

  const handleNotificationClick = async (id: string) => {
    await ApiClient.markNotificationRead(id);
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    // Dispatch event to update other components that might show notification count or details
    window.dispatchEvent(new Event("papama_data_update"));
  };

  const navItems = [
    { name: "Dashboard", href: "/donor/dashboard", icon: "home" as const },
    { name: "Donate", href: "/donor/donate", icon: "heart" as const },
    { name: "Credit", href: "/donor/credit", icon: "wallet" as const },
    { name: "Tokens", href: "/donor/tokens", icon: "ticket" as const },
    { name: "History", href: "/donor/history", icon: "clock" as const },
    { name: "Impact", href: "/donor/impact", icon: "impact" as const },
  ];

  // Mobile bottom-bar tabs that flank the raised Donate FAB. Credit is omitted
  // here because it's already reachable from the header balance chip; Donate is
  // promoted to the center FAB as the primary donor action.
  const mobileTabs = [
    { name: "Dashboard", href: "/donor/dashboard", icon: "home" as const },
    { name: "Tokens", href: "/donor/tokens", icon: "ticket" as const },
    { name: "History", href: "/donor/history", icon: "clock" as const },
    { name: "Impact", href: "/donor/impact", icon: "impact" as const },
  ];

  const renderMobileTab = (item: (typeof mobileTabs)[number]) => {
    const isActive = pathname === item.href;
    return (
      <Link
        key={item.name}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className="flex flex-1 flex-col items-center gap-1"
      >
        <span
          className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
            isActive
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          <NavIcon name={item.icon} />
        </span>
        <span
          className={`text-[10px] font-semibold leading-none transition-colors duration-200 ${
            isActive
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {item.name}
        </span>
      </Link>
    );
  };

  return (
    <>
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Link href="/donor/dashboard" className="flex items-center gap-1.5">
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-xl font-bold tracking-tight text-transparent dark:from-emerald-400 dark:to-teal-300">
              pApAmA
            </span>
            <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 sm:inline-block">
              Donor Portal
            </span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex md:gap-x-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === "/donor/credit" && pathname === "/donor/credits");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`relative py-2 text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? "text-emerald-600 dark:text-emerald-400 font-bold"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                {item.name}
                {isActive && (
                  <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-emerald-600 dark:bg-emerald-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Side: Credits & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {credits !== null && (
            <Link
              href="/donor/credit"
              className="flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/50 px-3 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/30 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="h-4 w-4 stroke-[2.5]"
              >
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
              </svg>
              <span>
                <span className="hidden sm:inline">Balance: </span>₹{credits.credit_balance}
              </span>
            </Link>
          )}

          {/* Notifications Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((open) => !open)}
              aria-label="Donor notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 active:scale-[.98] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                      Donor Notifications
                    </p>
                    <p className="text-[10px] font-medium text-zinc-400">
                      Credit alerts and token activity
                    </p>
                  </div>
                  <Link
                    href="/donor/notifications"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    View All
                  </Link>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${
                          !notification.read
                            ? "bg-emerald-50/20 dark:bg-emerald-950/5"
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            handleNotificationClick(notification.id);
                            setIsNotificationsOpen(false);
                          }}
                          className="flex w-full gap-3 text-left"
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              !notification.read
                                ? "bg-emerald-500"
                                : "bg-zinc-300 dark:bg-zinc-700"
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-zinc-900 dark:text-zinc-50">
                              {notification.title}
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                              {notification.body}
                            </span>
                            {notification.type === "redemption" && notification.meta && (
                              <span className="mt-1 block rounded bg-zinc-50 px-2 py-1 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                Served {notification.meta.meal_info} at {notification.meta.vendor_name} ({notification.meta.location})
                              </span>
                            )}
                            <span className="mt-1 block text-[10px] font-medium text-zinc-400">
                              {new Date(notification.created_at).toLocaleString()}
                            </span>
                          </span>
                        </button>
                        {notification.type === "redemption" && (
                          <Link
                            href="/donor/donate"
                            onClick={() => setIsNotificationsOpen(false)}
                            className="mt-1.5 ml-5 inline-block text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            Donate again
                          </Link>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="px-4 py-8 text-center text-xs text-zinc-400">
                      No notifications yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile + sign out */}
          <div className="flex items-center gap-2 pl-1">
            <Link
              href="/donor/profile"
              aria-label="Your profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white ring-2 ring-emerald-500/20 dark:bg-emerald-500 dark:ring-emerald-400/15"
            >
              {initialsFromEmail(email)}
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 p-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 active:scale-[.98] dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 sm:px-3 sm:py-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4 sm:hidden"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </header>

      {/* Mobile bottom tab bar — fixed to the bottom for a native, thumb-reachable feel.
          Donate is promoted to a raised center FAB (the primary donor action);
          four sections flank it. Rendered OUTSIDE <header> so the header's
          backdrop-blur doesn't become its containing block (which would pin it to
          the header instead of the viewport). Safe-area padding keeps it clear of
          the iPhone home indicator. */}
      <nav
        aria-label="Donor sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/90 md:hidden"
      >
        <div className="relative mx-auto flex h-14 max-w-md items-center justify-around px-1">
          {mobileTabs.slice(0, 2).map(renderMobileTab)}

          {/* Reserve the center column so the four tabs stay evenly spaced around
              the raised Donate FAB. */}
          <div className="w-12 shrink-0" aria-hidden="true" />

          {mobileTabs.slice(2).map(renderMobileTab)}

          {/* Center FAB — Donate (the primary donor action). */}
          <Link
            href="/donor/donate"
            aria-label="Donate"
            aria-current={pathname === "/donor/donate" ? "page" : undefined}
            className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-4 ring-white transition hover:bg-emerald-700 active:scale-95 dark:bg-emerald-500 dark:ring-zinc-950 dark:hover:bg-emerald-400"
          >
            {/* Solid, balanced heart — reads cleanly centered on the filled FAB
                (the stroked nav heart looked squeezed/clipped at this size). */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
            </svg>
          </Link>
        </div>
      </nav>
    </>
  );
}
