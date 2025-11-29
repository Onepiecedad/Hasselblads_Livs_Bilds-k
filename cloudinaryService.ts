import { logger } from './logger';
import { urlToBase64 } from './geminiService';

interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

interface TransformationConfig {
  width: number;
  height: number;
  background: 'white' | 'transparent' | 'auto';
  quality: 'auto' | 'best' | number;
}

let config: CloudinaryConfig | null = null;

let transformConfig: TransformationConfig = {
  width: 1000,
  height: 1000,
  background: 'white',
  quality: 'auto'
};

export function setCloudinaryConfig(cloudName: string, uploadPreset: string): void {
  config = { cloudName, uploadPreset };
  logger.info('Cloudinary configured', { cloudName });
}

export function setTransformConfig(config: Partial<TransformationConfig>): void {
  transformConfig = { ...transformConfig, ...config };
  logger.info('Cloudinary transform config updated', transformConfig);
}

export function getTransformConfig(): TransformationConfig {
  return transformConfig;
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
  const bgParam = transformConfig.background === 'transparent' 
    ? 'b_transparent' 
    : transformConfig.background === 'auto' 
        ? 'b_auto' 
        : 'b_white';

  const qualityParam = typeof transformConfig.quality === 'number' 
    ? `q_${transformConfig.quality}` 
    : 'q_auto';

  const formatParam = transformConfig.background === 'transparent' ? 'f_png' : 'f_jpg';

  const transformation = `c_pad,${bgParam},w_${transformConfig.width},h_${transformConfig.height},${formatParam},${qualityParam}`;

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