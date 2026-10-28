import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "humor-project",
  description:
    "Rate jokes and memes from one to five stars, or play Showdown: two anonymous jokes, pick the funnier one, then find out if a human or an AI wrote it.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#ffffff",
};

const themeScript = `
(function () {
  var theme;
  try {
    var saved = localStorage.getItem('site-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (e) {}
  if (!theme) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff');
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <SiteHeader />
        {children}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </body>
    </html>
  );
}
