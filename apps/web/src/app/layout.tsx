import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Intellixy",
  description: "Tu material. Tu aprendizaje.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${manrope.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-oat text-ciruela">{children}</body>
    </html>
  );
}
