import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isDateExpired(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-800';
    case 'PENDING_INSURANCE_APPROVAL':
      return 'bg-blue-100 text-blue-800';
    case 'PENDING_MANAGER_APPROVAL':
      return 'bg-amber-100 text-amber-800';
    case 'PENDING_APPROVAL':
      return 'bg-yellow-100 text-yellow-800';
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'REJECTED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getRoleColor(role: string): string {
  switch (role) {
    case 'MANAGER':
      return 'bg-purple-100 text-purple-800';
    case 'ASSOCIATE':
      return 'bg-blue-100 text-blue-800';
    case 'VIEWER':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function parseOptions(optionsJson: string | null | undefined): { value: string; label: string }[] {
  if (!optionsJson) return [];
  try {
    return JSON.parse(optionsJson);
  } catch {
    return [];
  }
}

