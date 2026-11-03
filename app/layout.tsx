import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
const editorial = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-editorial" });
const laboratory = IBM_Plex_Mono({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-laboratory" });

export const metadata: Metadata = {
  title: "Creative Intelligence Lab",
  description:
    "Map which motivations and formats are missing from a Meta ad portfolio. Coverage only, with no performance predictions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${editorial.variable} ${laboratory.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
