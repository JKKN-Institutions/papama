import type { ReactNode } from "react";

import { BugReporterWrapper } from "@/components/bug-reporter-wrapper";

// Reserves space at the bottom on mobile so page content is never hidden
// behind the fixed bottom tab bar (see components/donor/Navbar.tsx).
// On md+ the bar is hidden, so the padding is removed.
// BugReporterWrapper self-gates on auth, so the widget shows only for signed-in
// donors (not on /donor/login or /donor/signup).
export default function DonorLayout({ children }: { children: ReactNode }) {
  return (
    <BugReporterWrapper>
      <div className="pb-16 md:pb-0">{children}</div>
    </BugReporterWrapper>
  );
}
