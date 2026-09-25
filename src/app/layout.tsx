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

export const metadata: Metadata = {
  title: "Deckwatch Kenya — Public Safety Intelligence",
  description:
    "AI-powered public safety and incident intelligence platform for Kenya. Live incident map, verification, and county risk intelligence.",
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
