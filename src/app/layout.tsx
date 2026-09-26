import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

// A measurement ID is public by design (it ships in every page's source), so
// it lives here rather than in an env var that would have to be set on Vercel
// before anything reported.
const GA_MEASUREMENT_ID = "G-3TG6W2W1R9";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://deckwatch.vercel.app";
const TITLE = "Deckwatch Kenya — Public Safety Intelligence";
const DESCRIPTION =
  "Live public safety and incident intelligence for Kenya. Incident map, verification scoring, and county risk intelligence, ingested from 13 Kenyan newsrooms.";

export const metadata: Metadata = {
  // Absolute URLs for social cards are resolved against this; without it
  // Next emits relative og:image paths, which no scraper will follow.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // Pages set only their own name; this keeps the brand on every tab and
    // every shared link without 47 counties repeating it by hand.
    template: "%s — Deckwatch Kenya",
  },
  description: DESCRIPTION,
  applicationName: "Deckwatch Kenya",
  openGraph: {
    type: "website",
    siteName: "Deckwatch Kenya",
    locale: "en_KE",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
  },
  // Card type only. Pinning a title here would override every page's own,
  // so a shared county link announced itself as the site's front page; left
  // unset, each page's title and description carry through, and Twitter
  // falls back to og:image for the picture.
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col bg-background text-foreground">
        <AppShell>{children}</AppShell>
      </body>
      {/* Production only: dev-server and local hits would otherwise count as
          real visitors and quietly inflate every number in the report. */}
      {process.env.NODE_ENV === "production" && (
        <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
      )}
    </html>
  );
}
