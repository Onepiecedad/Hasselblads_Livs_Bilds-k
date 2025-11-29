export interface Product {
  id: string; // Internal ID for tracking
  product_name: string;
  description: string;
  brand?: string; // Brand/Manufacturer
  initialImages?: string[]; // Images found in the CSV
  [key: string]: any; // Allow other CSV columns
}

export interface ProcessedProduct extends Product {
  status: 'pending' | 'processing' | 'completed' | 'skipped' | 'failed';
  finalImageUrl?: string; // Blob URL, external URL, or Cloudinary URL
  originalSearchResultUrl?: string;
  imageSource?: 'csv' | 'search' | 'generated' | 'edited';
  cloudinaryUrl?: string; // Explicit Cloudinary URL
  processingError?: string; // Reason for failure
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  CONFIGURE = 'CONFIGURE',
  DASHBOARD = 'DASHBOARD',
  MODE_SELECT = 'MODE_SELECT',
  BATCH = 'BATCH',
  PROCESS = 'PROCESS',
  EXPORT = 'EXPORT',
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string; // Base64 or URL
  isImageGeneration?: boolean;
}

export interface SearchResult {
  url: string;
  title: string;
  source: string;
}