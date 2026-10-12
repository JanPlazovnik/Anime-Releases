import { useState, type ReactNode } from "react";
import { Drawer } from "vaul";

export default function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} onAnimationEnd={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[96%] flex-col rounded-t-3xl bg-raised pb-[env(safe-area-inset-bottom)] outline-none"
        >
          <Drawer.Title className="sr-only">{label}</Drawer.Title>
          <div className="absolute left-1/2 top-2 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/70" />
          <div className="flex min-h-0 flex-col overflow-hidden rounded-t-3xl">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
