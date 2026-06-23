import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pApAmA - Food Token Platform",
  description: "Empowering communities through transparent food donation tokens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
