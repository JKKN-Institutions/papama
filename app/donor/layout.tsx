import type { ReactNode } from "react";

// Reserves space at the bottom on mobile so page content is never hidden
// behind the fixed bottom tab bar (see components/donor/Navbar.tsx).
// On md+ the bar is hidden, so the padding is removed.
export default function DonorLayout({ children }: { children: ReactNode }) {
  return <div className="pb-16 md:pb-0">{children}</div>;
}
