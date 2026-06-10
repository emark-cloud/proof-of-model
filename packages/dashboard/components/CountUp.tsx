"use client";

/**
 * Count-up number — animates 0 → value once on mount (design.md §4.2 "numbers
 * animate/count up on load"). Framer Motion drives a motion value; we render the
 * formatted snapshot. Initial paint shows the formatted final value (SSR-safe, no
 * hydration flash) and the animation replays it from zero on the client.
 */
import { useEffect, useState } from "react";
import { animate } from "framer-motion";

export function CountUp({
  value,
  format,
  durationMs = 900,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
