import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kræmmer Depositum",
  description: "System til håndtering af kræmmer-depositum",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
