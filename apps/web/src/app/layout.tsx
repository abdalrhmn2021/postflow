import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostFlow",
  description: "جدولة منشورات عملائك على فيسبوك وإنستغرام، مع موافقة العميل وكابشنات بالذكاء الاصطناعي.",
};

// Arabic first, right to left. Phase 1 adds the language switch (cookie, like BookFlow).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
