/**
 * Per-event visual treatment — the §1.1 mapping (design.md §4.3) in one place.
 * Full Tailwind class strings (no runtime concatenation of color names) so the
 * content scanner keeps every utility. SLASH/VERIFY carry the drama flags the feed
 * reads to fire the red glow / green pulse.
 */
import type { FeedEventKind } from "./types";

export interface FeedMeta {
  /** Badge label text. */
  label: string;
  /** Glyph in the row. */
  icon: string;
  /** Pill classes: border + tinted bg + text color. */
  pill: string;
  /** Message text color. */
  text: string;
  /** Drama treatment for the whole row, if any. */
  drama?: "slash" | "pass";
}

export const FEED_META: Record<FeedEventKind, FeedMeta> = {
  PAYMENT: {
    label: "PAYMENT",
    icon: "→",
    pill: "border-cyan-accent/40 bg-cyan-accent/10 text-cyan-accent",
    text: "text-text-primary",
  },
  COMMIT: {
    label: "COMMIT",
    icon: "◆",
    pill: "border-border-accent bg-bg-elevated text-text-primary",
    text: "text-text-primary",
  },
  CHALLENGE: {
    label: "CHALLENGE",
    icon: "⚑",
    pill: "border-amber-pending/40 bg-amber-pending/10 text-amber-pending",
    text: "text-text-primary",
  },
  VERIFY: {
    label: "VERIFY",
    icon: "✓",
    pill: "border-green-pass/40 bg-green-dim text-green-pass",
    text: "text-text-primary",
    drama: "pass",
  },
  SLASH: {
    label: "SLASH",
    icon: "✗",
    pill: "border-red-slash/50 bg-red-dim text-red-slash",
    text: "text-red-slash",
    drama: "slash",
  },
  BOUNTY: {
    label: "BOUNTY",
    icon: "◎",
    pill: "border-green-pass/40 bg-green-dim text-green-pass",
    text: "text-text-primary",
  },
  FINALIZE: {
    label: "FINALIZE",
    icon: "·",
    pill: "border-border-default bg-transparent text-text-secondary",
    text: "text-text-secondary",
  },
};
