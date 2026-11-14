import type { Metadata, Viewport } from "next";
import { Geist_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import type { ReactNode } from "react";

import { BRAND } from "@/lib/brand";

import "./globals.css";

// Both faces are SIL Open Font License 1.1 and are self-hosted at build time.
const thai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-thai",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} บันทึกรายรับรายจ่ายของธุรกิจ`,
    template: `%s | ${BRAND.name}`,
  },
  description:
    "ระบบบันทึกรายรับรายจ่ายสำหรับฟรีแลนซ์และธุรกิจขนาดเล็ก ดูผลประกอบการ แยกหมวดหมู่ และส่งออก CSV ได้ในที่เดียว (โปรเจกต์สาธิต)",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={`${thai.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
