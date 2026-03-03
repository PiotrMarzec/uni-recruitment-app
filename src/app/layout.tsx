import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "University Recruitment",
  description: "International trip recruitment application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
