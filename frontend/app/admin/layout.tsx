import type { Metadata } from "next";
import { AdminGuard } from "./AdminGuard";



export const metadata: Metadata = {
  title: "CBT Platform — Admin Console",
  description: "Computer-Based Testing administrator management portal.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminGuard>{children}</AdminGuard>;
}

