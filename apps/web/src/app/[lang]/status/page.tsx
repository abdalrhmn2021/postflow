import type { Metadata } from "next";
import SystemStatus from "@/components/SystemStatus";
import { getDictionary } from "@/i18n/get-dictionary";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).status.title };
}

// The phase 0 check, kept for development: browser -> Next.js -> API -> database / Redis / worker.
export default async function StatusPage() {
  const dict = await getDictionary();
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <SystemStatus t={dict.status} />
    </main>
  );
}
