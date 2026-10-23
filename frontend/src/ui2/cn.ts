import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Signed-in screens let a caller's className override a component's own utilities (text size, padding)
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
