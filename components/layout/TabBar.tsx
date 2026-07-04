"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, List, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/home", icon: Home, label: "Home" },
  { href: "/add", icon: PlusCircle, label: "Add" },
  { href: "/transactions", icon: List, label: "Transactions" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/settings", icon: Settings, label: "Settings" },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#111111] border-t border-white/5 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around px-2 h-[49px]">
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className={cn("flex flex-col items-center gap-0.5 px-2 h-full justify-center rounded-xl transition-colors min-w-[52px]",
                active ? "text-[#00FF85]" : "text-[#6b7280]"
              )}
              onClick={() => { if (navigator.vibrate) navigator.vibrate(5); }}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 1.8}
                className={active ? "drop-shadow-[0_0_6px_#00FF85]" : ""} />
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
