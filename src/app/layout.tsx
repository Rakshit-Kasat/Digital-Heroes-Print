import type { Metadata } from "next";
import { Red_Hat_Display, Red_Hat_Text } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const display = Red_Hat_Display({ variable: "--font-red-hat-display", subsets: ["latin"], weight: ["500", "700", "800"] });
const text = Red_Hat_Text({ variable: "--font-red-hat-text", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Digital Heroes Print — labels, race numbers, stamps, trophies, laser-cut", template: "%s · Digital Heroes Print" },
  description: "Configure any size, see the price instantly, design in your browser and approve a proof before anything is printed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${display.variable} ${text.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-sheet focus:px-3 focus:py-2">Skip to content</a>
        <SiteHeader />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
