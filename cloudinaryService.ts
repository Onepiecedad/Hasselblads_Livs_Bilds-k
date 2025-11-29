import { logger } from './logger';
import { urlToBase64 } from './geminiService';

interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

let config: CloudinaryConfig | null = null;

export function setCloudinaryConfig(cloudName: string, uploadPreset: string): void {
  config = { cloudName, uploadPreset };
  logger.info('Cloudinary configured', { cloudName });
}

export function isCloudinaryConfigured(): boolean {
  return config !== null && config.cloudName !== '' && config.uploadPreset !== '';
}

export async function uploadToCloudinary(imageData: string): Promise<string> {
  if (!config) {
    throw new Error('Cloudinary not configured. Call setCloudinaryConfig first.');
  }

  const formData = new FormData();
  formData.append('file', imageData);
  formData.append('upload_preset', config.uploadPreset);

  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
  
  const response = await fetch(endpoint, { method: 'POST', body: formData });

  if (!response.ok) {
    let errorData: any = {};
    let responseText = '';
    
    try {
        responseText = await response.text();
        // Try parsing JSON, otherwise keep as text
        errorData = JSON.parse(responseText);
    } catch (e) {
        errorData = { error: { message: responseText || response.statusText } };
    }
    
    const cloudMsg = errorData?.error?.message || JSON.stringify(errorData);
    const errorMessage = `Cloudinary upload failed: ${response.status} ${cloudMsg}`;
    
    // Log as WARN instead of ERROR to avoid spamming the console during retries.
    logger.warn('Cloudinary API Error', { 
        status: response.status, 
        message: cloudMsg
    });
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  let secureUrl = data.secure_url;

  // --- E-COMMERCE STANDARDIZATION ---
  // We inject transformations into the URL to ensure uniformity across all images in WooCommerce.
  // c_pad: Resize to fit dimensions, padding with background (prevents cropping product).
  // b_white: Sets the padding background to pure white.
  // w_1000,h_1000: Standard high-res square for e-commerce (good for zoom).
  // f_jpg: Force JPG format for best compatibility.
  // q_auto: Automatic quality optimization.
  const transformation = 'c_pad,b_white,w_1000,h_1000,f_jpg,q_auto';

  // Inject transformation before the version component (e.g., /v12345/)
  if (secureUrl.includes('/upload/')) {
      secureUrl = secureUrl.replace('/upload/', `/upload/${transformation}/`);
  }

  return secureUrl;
}

export async function uploadWithRetry(imageData: string, maxRetries = 3): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) logger.info(`Retrying upload (attempt ${attempt}/${maxRetries})...`);
      return await uploadToCloudinary(imageData);
    } catch (error: any) {
      lastError = error as Error;
      const errMsg = error.message || '';

      // 1. Fail immediately on 404 (Resource Not Found) to allow Batch Processor to try next image
      if (errMsg.includes('404') || errMsg.includes('Resource not found')) {
          logger.warn('Image resource not found (404), skipping retries on this URL.');
          throw error;
      }

      // 2. Fallback Strategy:
      // If Cloudinary fails to fetch remote URL (DNS, 403 Forbidden, etc),
      // try to download it locally in browser and upload the data URI instead.
      const isRemoteUrl = imageData.startsWith('http');
      if (isRemoteUrl && (errMsg.includes('400') || errMsg.includes('403') || errMsg.includes('DNS') || errMsg.includes('fail'))) {
          logger.info('Cloudinary fetch failed, attempting local fallback download...');
          try {
              const base64Data = await urlToBase64(imageData);
              logger.info('Local fallback download successful. Uploading data directly...');
              // Upload immediately without recursion to keep stack clean
              return await uploadToCloudinary(base64Data);
          } catch (localErr: any) {
              logger.warn('Local fallback failed.', { message: localErr.message });
              // CRITICAL: If local fallback also fails (CORS/Proxy error), stop retrying this URL.
              // It means neither Cloudinary nor the Browser can access it.
              throw new Error(`Upload failed (Remote & Local): ${localErr.message}`);
          }
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); 
      }
    }
  }
  
  logger.warn('All upload retries failed', { message: lastError?.message });
  throw lastError || new Error('Upload failed after retries');
}