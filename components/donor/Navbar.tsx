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
    { name: "Dashboard", href: "/donor/dashboard" },
    { name: "Donate", href: "/donor/donate" },
    { name: "Credit", href: "/donor/credit" },
    { name: "Tokens", href: "/donor/tokens" },
    { name: "History", href: "/donor/history" },
    { name: "Impact", href: "/donor/impact" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Link href="/donor/dashboard" className="flex items-center gap-1.5">
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-2xl font-black tracking-wider text-transparent dark:from-emerald-400 dark:to-teal-300">
              pApAmA
            </span>
            <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 sm:inline-block">
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
        <div className="flex items-center gap-3">
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
              <span>Balance: ₹{credits.credit_balance}</span>
            </Link>
          )}

          {/* Notifications Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((open) => !open)}
              aria-label="Donor notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
                            <span className="mt-1 block text-[9px] font-medium text-zinc-400">
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
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav Bar - Bottom bar on mobile for native feel */}
      <div className="border-t border-zinc-200/60 bg-white/95 px-2 py-1.5 dark:border-zinc-800/60 dark:bg-zinc-950/95 md:hidden">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === "/donor/credit" && pathname === "/donor/credits");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center text-[10px] font-bold transition-colors duration-200 ${
                  isActive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
