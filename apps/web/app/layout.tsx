import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tidal OS", template: "%s · Tidal OS" },
  description: "Tidal Consulting internal CRM",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  const themeClass = theme === "dark" || theme === "light" ? theme : undefined;
  return (
    <html lang="en" className={themeClass}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
