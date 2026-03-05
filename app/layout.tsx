import type { Metadata } from "next";
import { Sora, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// TechBirmingham brand fonts — Sora for headings, Source Sans 3 for body
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Grove — TechBirmingham Sponsor Research",
  description: "AI-powered sponsor discovery for Sloss.Tech & TechBirmingham events",
  icons: {
    icon: '/TechBirminghamAsset 1.svg',
    shortcut: '/TechBirminghamAsset 1.svg',
    apple: '/TechBirminghamAsset 1.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${sourceSans.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
