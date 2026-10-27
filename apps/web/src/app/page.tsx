import SystemStatus from "@/components/SystemStatus";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="text-center">
        <p className="text-sm font-medium text-brand">المرحلة ٠: التجهيز</p>
        <h1 className="mt-2 text-4xl font-bold">PostFlow</h1>
        <p className="mt-3 text-muted">
          جدولة منشورات عملائك على فيسبوك وإنستغرام، مع موافقة العميل وكابشنات بالذكاء الاصطناعي.
        </p>
      </div>
      <SystemStatus />
    </main>
  );
}
