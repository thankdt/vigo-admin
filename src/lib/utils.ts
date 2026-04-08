import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { API_BASE_URL } from "./api"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getImageUrl(img?: string) {
  if (!img) return '';
  if (img.startsWith('http')) return img;
  return `${API_BASE_URL}/${img.replace(/^\//, '')}`;
}
