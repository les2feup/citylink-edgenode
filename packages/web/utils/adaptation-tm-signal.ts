import { signal } from "@preact/signals"; // Import signal factory function

export const fetchedTM = signal<JSON | null>(null);
