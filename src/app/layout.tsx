import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: process.env.APP_NAME || "LoanOS",
  description: "Loan Origination (LOS) and Loan Management (LMS) platform for NBFCs, LSPs, banks and DSAs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
