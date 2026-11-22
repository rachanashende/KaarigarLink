import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "Pune, Maharashtra"; just "Pune" when the state is unknown (live workshops record a city only). */
export function placeLabel(location: { city: string; state: string }): string {
  return [location.city, location.state].map(part => part.trim()).filter(Boolean).join(', ');
}
