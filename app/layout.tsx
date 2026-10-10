import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ward Housing Ranker", template: "%s · Ward Housing Ranker" },
  description: "Which Chicago wards are actually adding housing: the 50 wards ranked by net new housing units permitted.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
