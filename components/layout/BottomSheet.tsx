"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="bg-[#111111] border-t border-white/10 rounded-t-3xl max-h-[85vh] overflow-y-auto px-4 pb-safe"
        style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-white/20 mb-4 mt-1" />
        {title && (
          <SheetHeader className="mb-4">
            <SheetTitle className="text-white text-lg font-semibold text-left">
              {title}
            </SheetTitle>
          </SheetHeader>
        )}
        {children}
      </SheetContent>
    </Sheet>
  );
}
