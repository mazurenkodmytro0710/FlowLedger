import { TabBar } from "@/components/layout/TabBar";
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {children}
      <TabBar />
    </div>
  );
}
