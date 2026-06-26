import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Hospitalist Scheduler",
  description:
    "Generate fair, constraint-aware monthly hospitalist coverage schedules.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0e1a] text-slate-200">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
