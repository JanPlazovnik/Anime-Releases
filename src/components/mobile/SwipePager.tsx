import { startTransition, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";

const SLIDES = 3;

// Three looping slides show the previous, current and next page relative to the selected slide,
// so paging only changes what each slide renders and never moves them.
function slideOffset(slide: number, selected: number) {
  return ((slide - selected + SLIDES + 1) % SLIDES) - 1;
}

export default function SwipePager({
  onChange,
  pageKey,
  renderPage,
}: {
  onChange: (offset: number) => void;
  pageKey: (offset: number) => string;
  renderPage: (offset: number) => ReactNode;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selected, setSelected] = useState(0);
  const target = useRef(0);

  const onSelect = useEffectEvent(() => {
    const next = emblaApi!.selectedScrollSnap();
    const offset = slideOffset(next, target.current);
    if (offset === 0) return;
    target.current = next;
    // A transition lets the new pages render in slices between the carousel's animation frames.
    startTransition(() => {
      setSelected(next);
      onChange(offset);
    });
  });

  useEffect(() => {
    if (!emblaApi) return;
    const handler = () => onSelect();
    emblaApi.on("select", handler);
    return () => {
      emblaApi.off("select", handler);
    };
  }, [emblaApi]);

  return (
    <div ref={emblaRef} className="min-h-0 flex-1 overflow-hidden">
      <div className="flex h-full touch-pan-y">
        {Array.from({ length: SLIDES }, (_, slide) => {
          const offset = slideOffset(slide, selected);
          return (
            <div key={slide} className="flex min-h-0 min-w-0 shrink-0 grow-0 basis-full flex-col">
              <div key={pageKey(offset)} className="flex min-h-0 flex-1 flex-col">
                {renderPage(offset)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
