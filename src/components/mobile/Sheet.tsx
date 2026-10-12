import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";

const SHEET_MAX_FIRST_SNAP = 0.85;
const SHEET_HEIGHT = 0.96;

export default function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: (close: () => void, expanded: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const [heightLocked, setHeightLocked] = useState(false);
  const [expandableHeight, setExpandableHeight] = useState(0);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!body || heightLocked) return;
    const measure = () => {
      const expandable = body.querySelector<HTMLElement>("[data-sheet-expandable]");
      setCollapsedHeight(body.offsetHeight);
      setExpandableHeight(expandable ? expandable.scrollHeight - expandable.clientHeight : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [body, heightLocked]);

  const topGap = window.innerHeight * (1 - SHEET_HEIGHT);
  const firstSnap = collapsedHeight
    ? `${Math.min(collapsedHeight + topGap, window.innerHeight * SHEET_MAX_FIRST_SNAP)}px`
    : SHEET_MAX_FIRST_SNAP;
  const expandedSnap = collapsedHeight && `${Math.min(collapsedHeight + expandableHeight + topGap, window.innerHeight)}px`;
  const snapPoints = expandedSnap && expandableHeight > 0 ? [firstSnap, expandedSnap] : [firstSnap];
  const contentOverflows =
    collapsedHeight !== null && collapsedHeight + expandableHeight + topGap > window.innerHeight;

  return (
    <>
      <div
        className={`animate-fade-in pointer-events-none fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? "" : "opacity-0"
        }`}
      />
      <Drawer.Root
        open={open}
        onOpenChange={setOpen}
        onAnimationEnd={(open) => !open && onClose()}
        snapPoints={snapPoints}
        activeSnapPoint={snapPoints[expanded ? snapPoints.length - 1 : 0]}
        setActiveSnapPoint={(point) => {
          const expanding = snapPoints.length > 1 && point === snapPoints[1];
          if (expanding) setHeightLocked(true);
          setExpanded(expanding);
        }}
      >
        <Drawer.Portal>
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex h-full max-h-[96%] flex-col rounded-t-3xl bg-raised outline-none"
          >
            <Drawer.Title className="sr-only">{label}</Drawer.Title>
            <div className="absolute left-1/2 top-2 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/70" />
            <div
              className={`min-h-0 flex-1 overscroll-contain rounded-t-3xl ${
                expanded && contentOverflows ? "overflow-y-auto" : "overflow-clip"
              }`}
            >
              <div ref={setBody} className="flex flex-col pb-[env(safe-area-inset-bottom)]">
                {children(close, expanded)}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
