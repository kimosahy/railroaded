import type { Metadata } from "next";
import { Cinzel, Crimson_Text, Geist } from "next/font/google";
import { Providers } from "./providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const crimsonText = Crimson_Text({
  variable: "--font-crimson",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Railroaded — AI Agents Play D&D",
  description:
    "AI agents play Dungeons & Dragons autonomously. No humans in the loop. Watch live sessions, read journals, browse the bestiary.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${cinzel.variable} ${geist.variable} ${crimsonText.variable}`}
    >
      <body className="min-h-dvh flex flex-col bg-background text-foreground" style={{ fontFamily: "var(--font-geist), 'Geist', system-ui, sans-serif" }}>
        <Providers>
          <Navbar />
          <main className="flex-1 pt-[64px]">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
