import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EdaCall",
  description: "Painel de operacao do EdaCall",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
