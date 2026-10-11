"use client";

import { useState, type ReactNode } from "react";

export default function Menu({
  label,
  button,
  buttonClassName,
  children,
}: {
  label: string;
  button: ReactNode;
  buttonClassName: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} title={label} aria-label={label} className={buttonClassName}>
        {button}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="animate-popover-in absolute right-0 top-full z-50 mt-1 min-w-48 origin-top-right overflow-hidden rounded-xl bg-raised py-2 shadow-xl ring-1 ring-black/5">
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-hover">
      {children}
    </button>
  );
}
