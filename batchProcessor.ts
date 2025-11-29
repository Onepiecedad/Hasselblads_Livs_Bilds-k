import { ProcessedProduct, Product } from './types';
import { searchProductImages, generateProductImage } from './geminiService';
import { uploadWithRetry, isCloudinaryConfigured, uploadToCloudinary } from './cloudinaryService';
import { logger } from './logger';
import { saveState } from './storageService';

export interface BatchProgress {
  current: number;
  total: number;
  currentProduct: string;
  completed: number;
  failed: number;
  skipped: number;
}

export interface BatchResult {
  products: ProcessedProduct[];
  stats: {
    completed: number;
    failed: number;
    skipped: number;
    totalTime: number;
  };
}

// Increased timeout to allow for search retries AND generation fallback
const PRODUCT_TIMEOUT_MS = 30000; // 30 seconds per product (Reduced to fail fast)

export async function runBatchProcess(
  products: Product[],
  onProgress: (progress: BatchProgress) => void,
  options: {
    delayBetweenProducts?: number;
    skipExistingImages?: boolean;
    abortSignal?: AbortSignal;
    onImageResult?: (product: Product, imageUrl: string | null) => void;
  } = {}
): Promise<BatchResult> {
  const {
    delayBetweenProducts = 2000,
    skipExistingImages = true,
    abortSignal,
    onImageResult
  } = options;

  logger.info(`Starting batch process for ${products.length} products`, { options });

  const startTime = Date.now();
  const results: ProcessedProduct[] = [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i++) {
    // Check for abort
    if (abortSignal?.aborted) {
      logger.warn('Batch process aborted by user');
      // Mark remaining as pending
      for (let j = i; j < products.length; j++) {
        const remaining = products[j] as ProcessedProduct;
        remaining.status = 'pending';
        results.push(remaining);
      }
      break;
    }

    const product = products[i] as ProcessedProduct;
    logger.info(`Processing [${i + 1}/${products.length}]: ${product.product_name}`);

    onProgress({
      current: i + 1,
      total: products.length,
      currentProduct: product.product_name,
      completed,
      failed,
      skipped
    });

    let result: ProcessedProduct;

    // Wrap processing in a timeout race
    try {
        const processPromise = processSingleProduct(product, skipExistingImages);
        const timeoutPromise = new Promise<ProcessedProduct>((_, reject) => 
            setTimeout(() => reject(new Error('Operation timed out (30s)')), PRODUCT_TIMEOUT_MS)
        );

        result = await Promise.race([processPromise, timeoutPromise]);
        
        // Notify live preview
        if (onImageResult) {
            const img = result.finalImageUrl || result.cloudinaryUrl || null;
            onImageResult(result, img);
        }

        results.push(result);
        if (result.status === 'completed') {
            if (result.imageSource === 'csv') skipped++; // Counted as skipped in context of "AI generation" but completed work
            else completed++;
        } else {
            failed++;
        }

        // Auto-save progress varje 5:e produkt
        if (results.length % 5 === 0) {
            try {
                const remainingProducts = products.slice(i + 1).map(p => ({
                    ...p as ProcessedProduct,
                    status: 'pending' as const
                }));
                saveState([...results, ...remainingProducts]);
                logger.info(`Auto-saved progress: ${results.length}/${products.length}`);
            } catch (e) {
                // Ignore save errors, not critical
            }
        }

    } catch (error: any) {
        // Robust error message extraction
        let errMsg = 'Unknown error';
        try {
            if (typeof error === 'string') {
                errMsg = error;
            } else if (error instanceof Error) {
                errMsg = error.message;
            } else if (typeof error === 'object' && error !== null) {
                // Try to extract message property or stringify
                errMsg = (error as any).message || JSON.stringify(error);
                if (errMsg === '{}') errMsg = String(error);
            } else {
                errMsg = String(error);
            }
        } catch (e) {
            errMsg = 'Error could not be stringified';
        }

        logger.error(`Product failed: ${product.product_name}`, { reason: errMsg });
        
        result = {
            ...product,
            status: 'failed',
            processingError: errMsg
        };
        results.push(result);
        if (onImageResult) onImageResult(result, null);
        failed++;
    }

    // Dynamisk delay baserat på resultat
    let dynamicDelay = delayBetweenProducts;

    // Om produkten misslyckades, kortare delay
    if (result.status === 'failed') {
      dynamicDelay = Math.min(delayBetweenProducts, 200);
    }

    // Om bilden genererades, längre delay pga tyngre API-anrop
    if (result.imageSource === 'generated') {
      dynamicDelay = Math.max(delayBetweenProducts, 2000);
    }

    // Om det var en CSV-bild (skippad), minimal delay
    if (result.imageSource === 'csv') {
      dynamicDelay = 100;
    }

    await delay(dynamicDelay);
  }

  logger.info('Batch process finished', { completed, failed, skipped });
  return {
    products: results,
    stats: {
      completed,
      failed,
      skipped,
      totalTime: Date.now() - startTime
    }
  };
}

async function processSingleProduct(product: ProcessedProduct, skipExistingImages: boolean): Promise<ProcessedProduct> {
    // Strategy 1: Use existing images from CSV
    if (skipExistingImages && product.initialImages && product.initialImages.length > 0) {
      try {
        let finalUrl = product.initialImages[0];
        // Upload existing image to Cloudinary if configured
        if (isCloudinaryConfigured()) {
            logger.info(`Uploading existing image for ${product.product_name} to Cloudinary...`);
            finalUrl = await uploadWithRetry(finalUrl);
            logger.success(`Existing image uploaded: ${finalUrl}`);
        } else {
            logger.info(`Skipping Cloudinary (not configured), using local URL`);
        }
        
        return {
          ...product,
          status: 'completed',
          finalImageUrl: finalUrl,
          originalSearchResultUrl: product.initialImages[0],
          imageSource: 'csv',
          cloudinaryUrl: isCloudinaryConfigured() ? finalUrl : undefined
        };
      } catch (err: any) {
        logger.warn(`Failed to upload existing image for ${product.product_name}`, { message: err.message });
        // If CSV image fails, we fall through to search strategy below
        logger.info('Falling back to Search strategy...');
      }
    }

    // Strategy 2: Search for product image
    try {
      logger.info(`Searching for image: "${product.product_name}"`);
      // Pass the brand info to search function for better precision
      const searchResults = await searchProductImages(product.product_name, product.brand, product.description);

      if (searchResults && searchResults.length > 0) {
        
        if (isCloudinaryConfigured()) {
            // Try up to 2 candidates (Reduced from 3 to save time)
            const candidates = searchResults.slice(0, 2);
            
            for (const candidate of candidates) {
                try {
                    logger.info(`Attempting upload for candidate: ${candidate.url}`);
                    const finalUrl = await uploadWithRetry(candidate.url);
                    logger.success(`Cloudinary upload complete: ${finalUrl}`);
                    
                    return {
                        ...product,
                        status: 'completed',
                        finalImageUrl: finalUrl,
                        originalSearchResultUrl: candidate.url,
                        imageSource: 'search',
                        cloudinaryUrl: finalUrl
                    };
                } catch (uploadError: any) {
                    const msg = uploadError.message || '';
                    if (msg === 'URL_IS_HTML' || msg === 'INVALID_IMAGE_DATA' || msg === 'TIMEOUT') {
                         logger.warn(`Skipping candidate ${candidate.url} due to: ${msg}`);
                         // Fail fast for this candidate
                         continue;
                    }

                    logger.warn(`Failed to upload candidate ${candidate.url}.`, { message: uploadError.message });
                    // Continue to next candidate
                }
            }
            logger.warn(`All search candidates failed to upload for ${product.product_name}.`);
        } else {
            // No Cloudinary, just take first
            return {
                ...product,
                status: 'completed',
                finalImageUrl: searchResults[0].url,
                originalSearchResultUrl: searchResults[0].url,
                imageSource: 'search'
            };
        }
      } else {
        logger.warn(`No search results found for ${product.product_name}`);
      }
    } catch (error: any) {
      logger.warn(`Search strategy failed: ${error.message}`);
    }

    // Strategy 3: Generation Fallback
    // If we reach here, either search found nothing, or all uploads failed (CORS/DNS)
    if (isCloudinaryConfigured()) {
        try {
            logger.info(`[Fallback] Generating AI image for ${product.product_name}...`);
            const generatedBase64 = await generateProductImage(product.product_name);
            
            logger.info(`Uploading generated image to Cloudinary...`);
            // We use uploadToCloudinary directly because it's already base64, no retry logic needed for fetch
            const cloudUrl = await uploadToCloudinary(generatedBase64);
            
            // Extra delay efter generation för att undvika rate limiting
            logger.info('Adding cooldown after image generation...');
            await delay(2000);

            return {
                ...product,
                status: 'completed',
                finalImageUrl: cloudUrl,
                imageSource: 'generated',
                cloudinaryUrl: cloudUrl
            };
        } catch (genError: any) {
            logger.error(`Generation fallback failed for ${product.product_name}`, { message: genError.message });
            return {
                ...product,
                status: 'failed',
                processingError: `All strategies failed (Search & Gen). Last error: ${genError.message}`
            };
        }
    }

    const errorMsg = 'All strategies exhausted: CSV upload failed, Search found no valid images, Generation not attempted or failed';
    // logger.error(`Product failed: ${product.product_name}`, { reason: errorMsg }); // Removed duplicate logging

    return {
        ...product,
        status: 'failed',
        processingError: errorMsg
    };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
