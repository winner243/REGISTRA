import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { brand } from "@/config/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s — ${brand.name}`,
  },
  description: brand.description,
  icons: {
    icon: [{ url: brand.favicon, sizes: "64x64", type: "image/x-icon" }],
  },
};

const brandStyles = `
  :root {
    --primary: ${brand.colors.light.primary};
    --primary-foreground: ${brand.colors.light.primaryForeground};
    --ring: ${brand.colors.light.ring};
  }
  .dark {
    --primary: ${brand.colors.dark.primary};
    --primary-foreground: ${brand.colors.dark.primaryForeground};
    --ring: ${brand.colors.dark.ring};
  }
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <style dangerouslySetInnerHTML={{ __html: brandStyles }} />
        {children}
      </body>
    </html>
  );
}