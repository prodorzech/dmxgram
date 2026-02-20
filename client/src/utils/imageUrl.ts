const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Converts a relative image path to a full URL
 * @param path - Relative path like '/uploads/avatars/file.jpg' or full URL
 * @returns Full image URL with API domain
 */
export function getImageUrl(path: string | undefined): string {
  if (!path) return '';
  
  // If it's already a full URL (http:// or https://), return as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // If it's a blob URL (from file preview), return as is
  if (path.startsWith('blob:')) {
    return path;
  }
  
  // If it's a relative path, prepend API_URL
  return `${API_URL}${path}`;
}
