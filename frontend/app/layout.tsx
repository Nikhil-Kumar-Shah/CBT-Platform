import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ChunkErrorHandler } from "@/components/ChunkErrorHandler";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "CBT Platform — Examination Management",
  description: "Computer-Based Testing platform and examination control panel.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <ChunkErrorHandler />
        <ThemeProvider>
          <AuthProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
