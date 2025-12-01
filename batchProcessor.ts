
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
const PRODUCT_TIMEOUT_MS = 90000; // 90 seconds per product

export async function runBatchProcess(
  products: Product[],
  onProgress: (progress: BatchProgress) => void,
  options: {
    delayBetweenProducts?: number;
    skipExistingImages?: boolean;
    abortSignal?: AbortSignal;
    onProductProcessed?: (product: ProcessedProduct) => void;
    checkPauseState?: () => boolean;
  } = {}
): Promise<BatchResult> {
  const {
    delayBetweenProducts = 2000,
    skipExistingImages = true,
    abortSignal,
    onProductProcessed,
    checkPauseState
  } = options;

  logger.info(`Starting batch process for ${products.length} products`, { options });

  const startTime = Date.now();
  const results: ProcessedProduct[] = [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i++) {
    
    // --- ABORT CHECK START ---
    if (abortSignal?.aborted) {
      logger.warn('Batch process aborted by user (Signal received)');
      break;
    }

    // --- PAUSE CHECK START ---
    if (checkPauseState) {
        while (checkPauseState()) {
            if (abortSignal?.aborted) break; // Allow aborting while paused
            await delay(500); // Polling interval
        }
        if (abortSignal?.aborted) break;
    }

    const product = products[i] as ProcessedProduct;
    // Skip already completed products if restarting a batch
    if (product.status === 'completed' && skipExistingImages) {
        results.push(product);
        if (product.imageSource === 'csv') skipped++; else completed++;
        onProgress({
          current: i + 1,
          total: products.length,
          currentProduct: product.product_name,
          completed,
          failed,
          skipped
        });
        continue;
    }

    logger.info(`>>> Processing [${i + 1}/${products.length}]: ${product.product_name} <<<`);

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
            setTimeout(() => reject(new Error('Operation timed out (90s)')), PRODUCT_TIMEOUT_MS)
        );

        result = await Promise.race([processPromise, timeoutPromise]);
        
        results.push(result);
        if (result.status === 'completed') {
            if (result.imageSource === 'csv') skipped++; // Counted as skipped in context of "AI generation" but completed work
            else completed++;
        } else {
            failed++;
        }

        // Live update to parent
        if (onProductProcessed) {
            onProductProcessed(result);
        }

        // Auto-save progress varje 5:e produkt
        if (results.length % 5 === 0) {
            try {
                // Construct a temporary full list state to save
                // (Mix of new results and old pending products)
                const currentFullState = [...results];
                for(let k=i+1; k<products.length; k++) {
                    currentFullState.push({ ...products[k] as ProcessedProduct, status: 'pending' });
                }
                saveState(currentFullState);
                logger.info(`Auto-saved progress: ${results.length}/${products.length}`);
            } catch (e) {
                // Ignore save errors, not critical
            }
        }

    } catch (error: any) {
        // IMPROVED ERROR LOGGING
        let errMsg = 'Unknown error';
        
        try {
            if (typeof error === 'string') {
                errMsg = error;
            } else if (error instanceof Error) {
                errMsg = error.message;
            } else if (typeof error === 'object') {
                // Handle arbitrary objects, preventing [object Object]
                errMsg = JSON.stringify(error, Object.getOwnPropertyNames(error));
                if (errMsg === '{}') errMsg = String(error);
            } else {
                errMsg = String(error);
            }
        } catch (e) {
            errMsg = 'Non-serializable error object';
        }

        logger.error(`Timeout/Error processing ${product.product_name}`, { message: errMsg });
        
        result = {
            ...product,
            status: 'failed',
            processingError: errMsg
        };
        results.push(result);
        failed++;
        
        if (onProductProcessed) onProductProcessed(result);
    }

    // --- ABORT CHECK POST-PROCESS ---
    // Important: Check abort immediately after processing to stop quickly if user clicked stop during API call
    if (abortSignal?.aborted) {
        logger.warn('Batch process aborted immediately after processing');
        break;
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

    // logger.info(`Wait ${dynamicDelay}ms...`);
    await delay(dynamicDelay);
  }

  // Fill remaining items if aborted
  if (abortSignal?.aborted && results.length < products.length) {
      for (let j = results.length; j < products.length; j++) {
          const remaining = products[j] as ProcessedProduct;
          // Ensure they are marked pending if not processed
          if (!results.find(r => r.id === remaining.id)) {
             results.push({ ...remaining, status: 'pending' });
          }
      }
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
        logger.info(`[Step 1] Checking CSV image for ${product.product_name}...`);
        let finalUrl = product.initialImages[0];
        // Upload existing image to Cloudinary if configured
        if (isCloudinaryConfigured()) {
            logger.info(`[Step 1] Uploading CSV image to Cloudinary...`);
            finalUrl = await uploadWithRetry(finalUrl);
            logger.success(`[Step 1] Existing image uploaded: ${finalUrl}`);
        } else {
            logger.info(`[Step 1] Cloudinary not configured, keeping local URL`);
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
        logger.warn(`[Step 1] Failed to upload existing image for ${product.product_name}`, { message: err.message });
        // If CSV image fails, we fall through to search strategy below
        logger.info('Falling back to Search strategy...');
      }
    }

    // Strategy 2: Search for product image
    try {
      logger.info(`[Step 2] Searching Google for: "${product.product_name}"`);
      // Pass the brand info to search function for better precision
      const searchResults = await searchProductImages(product.product_name, product.brand, product.description);

      if (searchResults && searchResults.length > 0) {
        
        logger.info(`[Step 2] Search returned ${searchResults.length} candidates.`);
        searchResults.forEach((r, idx) => {
             // Limit log spam to first 3
             if (idx < 3) logger.info(`  Candidate ${idx+1}: ${r.url}`);
        });

        if (isCloudinaryConfigured()) {
            // Try up to 2 candidates (Reduced from 3 to save time)
            const candidates = searchResults.slice(0, 2);
            
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                try {
                    logger.info(`[Step 2.1] Processing candidate URL ${i+1}/${candidates.length}: ${candidate.url.substring(0, 40)}...`);
                    const finalUrl = await uploadWithRetry(candidate.url);
                    logger.success(`[Step 2.1] Cloudinary upload complete: ${finalUrl}`);
                    
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
                         logger.warn(`[Step 2.1] Skipping candidate ${candidate.url} due to: ${msg}`);
                         // Fail fast for this candidate
                         continue;
                    }

                    logger.warn(`[Step 2.1] Failed to upload candidate ${candidate.url}.`, { message: uploadError.message });
                    // Continue to next candidate
                }
            }
            logger.warn(`[Step 2.1] All search candidates failed to upload for ${product.product_name}.`);
        } else {
            // No Cloudinary, just take first
            logger.info(`[Step 2.1] No Cloudinary, using direct link`);
            return {
                ...product,
                status: 'completed',
                finalImageUrl: searchResults[0].url,
                originalSearchResultUrl: searchResults[0].url,
                imageSource: 'search'
            };
        }
      } else {
        logger.warn(`[Step 2] No search results found for ${product.product_name}`);
      }
    } catch (error: any) {
      logger.warn(`[Step 2] Search strategy failed: ${error.message}`);
    }

    // Strategy 3: Generation Fallback
    // If we reach here, either search found nothing, or all uploads failed (CORS/DNS)
    if (isCloudinaryConfigured()) {
        try {
            logger.info(`[Step 3] AI Generation fallback for ${product.product_name}...`);
            const generatedBase64 = await generateProductImage(product.product_name);
            
            logger.info(`[Step 3.1] Uploading generated image to Cloudinary...`);
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
            logger.error(`[Step 3] Generation fallback failed for ${product.product_name}`, { message: genError.message });
            return {
                ...product,
                status: 'failed',
                processingError: `All strategies failed (Search & Gen). Last error: ${genError.message}`
            };
        }
    }

    const errorMsg = 'All strategies exhausted: CSV upload failed, Search found no valid images, Generation not attempted or failed';
    logger.error(`Product failed: ${product.product_name}`, { reason: errorMsg });

    return {
        ...product,
        status: 'failed',
        processingError: errorMsg
    };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
