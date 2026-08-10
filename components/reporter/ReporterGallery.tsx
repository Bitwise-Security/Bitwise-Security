"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Screenshot = {
  src: string;
  alt: string;
  title: string;
};

type ReporterGalleryProps = {
  items: Screenshot[];
};

export default function ReporterGallery({ items }: ReporterGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeIndex]);

  const activeItem = activeIndex === null ? null : items[activeIndex];

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item, index) => (
          <div
            key={item.src}
            className={`overflow-hidden rounded-3xl border border-cyber-blue/20 bg-gradient-to-b from-cyber-darkBlue/90 to-cyber-dark/95 text-left box-glow ${
              index === 0 ? "md:col-span-2 lg:col-span-1" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-cyber-blue/10">
              <div className="min-w-0">
                <h3 className="text-white text-lg font-semibold">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  Open the preview for a closer look
                </p>
              </div>
            </div>

            <div className="relative aspect-[16/11] bg-[#060915]">
              <div className="absolute inset-4 rounded-2xl overflow-hidden border border-cyber-blue/20 bg-cyber-dark">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  className="object-contain transition-transform duration-500 hover:scale-[1.02]"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-cyber-blue/10 px-5 py-4">
              <span className="text-sm text-gray-300">
                Open the full image preview
              </span>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className="rounded-full border border-cyber-orange/30 bg-cyber-dark/80 px-4 py-2 text-xs uppercase tracking-[0.22em] text-cyber-orange transition-colors hover:border-cyber-orange hover:bg-cyber-orange/10"
              >
                Preview
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeItem && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-28 pb-6">
          <button
            type="button"
            aria-label="Close screenshot preview"
            onClick={() => setActiveIndex(null)}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />
          <div className="relative z-10 flex h-[calc(100vh-9rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-cyber-blue/30 bg-gradient-to-b from-cyber-darkBlue to-cyber-dark shadow-2xl shadow-cyber-blue/20">
            <div className="flex items-center justify-between gap-4 border-b border-cyber-blue/10 px-6 py-4">
              <h3 className="truncate text-white text-lg font-semibold">
                {activeItem.title}
              </h3>
              <button
                type="button"
                onClick={() => setActiveIndex(null)}
                aria-label="Close screenshot preview"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-cyber-orange/30 bg-black/80 text-cyber-orange shadow-lg shadow-black/30 transition-all hover:border-cyber-orange hover:bg-cyber-orange/10 hover:scale-105"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-[#050814] p-3 md:p-4">
              <Image
                src={activeItem.src}
                alt={activeItem.alt}
                width={1600}
                height={1000}
                className="h-full w-full rounded-[1.4rem] border border-cyber-blue/15 object-contain"
                priority
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
