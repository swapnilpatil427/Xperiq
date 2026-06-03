import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strip LLM-internal citation markers from customer-facing text.
 * The LLM embeds [RESP:26ec15e2] and [INS:ba58f64c] to track sources,
 * but customers should never see these IDs.
 */
export function stripCitationRefs(text: string): string {
  return text
    .replace(/\[(?:RESP|INS):[a-zA-Z0-9]{1,16}\]\s*/gi, '')
    .replace(/\[r[a-f0-9]{6,8}\]\s*/gi, '')   // also strip [rXXXXXXXX] format from narrate_topic_insight
    .trim();
}
