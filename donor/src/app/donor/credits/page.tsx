"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CreditsPageLegacy() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/donor/credit");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
    </div>
  );
}
