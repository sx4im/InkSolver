import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function subjectLabel(subject: string) {
  const labels: Record<string, string> = {
    math: "Math",
    physics: "Physics",
    chem: "Chemistry",
    unknown: "Unknown",
  };

  return labels[subject] ?? "Unknown";
}
