import { GoogleGenAI } from "@google/genai";
import { GEMINI_TEXT_MODEL, GEMINI_IMAGE_EDIT_MODEL, SYSTEM_INSTRUCTION_SEARCH } from "./constants";
import { SearchResult } from "./types";
import { logger } from "./logger";

// Initialize the API client
// Use a safe check for browser environments where process might be undefined
const getEnvApiKey = () => (typeof process !== 'undefined' && process.env && process.env.API_KEY) 
  ? process.env.API_KEY 
  : (import.meta as any).env?.VITE_API_KEY;

// Mutable client instance to allow updates from UI config
let ai = new GoogleGenAI({ apiKey: getEnvApiKey() || '' });

// SECURITY: CORS Proxy Usage
const CORS_PROXY_BASE = "https://corsproxy.io/?";

// Search Config
let searchConfig: { apiKey: string, cx: string } | null = null;
let cseQuotaExceeded = false; // Circuit breaker

export const setSearchConfig = (apiKey: string, cx: string) => {
    const cleanKey = apiKey.trim();
    const cleanCx = cx.trim();
    searchConfig = { apiKey: cleanKey, cx: cleanCx };
    cseQuotaExceeded = false;
    
    // Also update the Gemini Client with this key to ensure AI features work
    // even if env variables are missing
    if (cleanKey) {
        try {
            ai = new GoogleGenAI({ apiKey: cleanKey });
            logger.info(`Gemini Client updated with configured key.`);
        } catch (e) {
            logger.error('Failed to re-initialize Gemini client', e);
        }
    }
    
    logger.info(`Search API configured. Key: ${cleanKey.substring(0, 8)}... CX: ${cleanCx}`);
};

export const isSearchConfigured = () => {
    return searchConfig !== null && searchConfig.apiKey !== '' && searchConfig.cx !== '';
};

// Domains to explicitly ignore (Stock photos, Dictionaries, etc)
// NOTE: Wikipedia removed from here to handle via specific logic below
const BLOCKED_DOMAINS: string[] = [
  'britannica.com',
  'ne.se',
  'snl.no',
  'encyclopedia.com',
  'merriam-webster.com',
  'dictionary.com',
  'istockphoto.com',
  'shutterstock.com',
  'gettyimages',
  '123rf.com',
  'alamy.com',
  'dreamstime.com',
  'vectorstock.com',
  'pinterest',
  'depositphotos',
  'bigstockphoto.com'
];

// URLs that are technically broken for direct access (Crawler only)
const BLOCKED_URL_PATTERNS: string[] = [
  'lookaside.fbsbx.com',
  'lookaside.instagram.com', 
  'platform-lookaside',
  '/crawler/media/',           // Facebook crawler-only URLs
  'seo/google_widget/crawler', // Instagram crawler-only URLs
];

// Priority domains for Swedish grocery context
const SWEDISH_GROCERY_CONTEXT = `
Context: You are searching for product images for a Swedish grocery e-commerce store.
Prioritize finding images from these retailers if possible:
- Mathem, Coop, ICA, Willys, Hemköp, City Gross, Matspar, Axfood, Menigo, Martin & Servera.
`;

/**
 * Helper to check if a URL looks like a VALID product image.
 */
const isLikelyImageUrl = (url: string): { valid: boolean; reason?: string } => {
  if (!url) return { valid: false, reason: 'Empty URL' };
  const lower = url.toLowerCase();
  
  // 1. Block broken URL patterns (Technical blocks)
  if (BLOCKED_URL_PATTERNS.some(pattern => lower.includes(pattern))) {
      return { valid: false, reason: 'Broken URL pattern (Lookaside/Crawler)' };
  }

  // 2. Blocked Domains check
  const blocked = BLOCKED_DOMAINS.find(domain => lower.includes(domain));
  if (blocked) {
      return { valid: false, reason: `Blocked Domain: ${blocked}` };
  }

  // 3. Intelligent Wikipedia Filtering
  // Block Article pages (wikipedia.org/wiki/) BUT Allow images (upload.wikimedia.org)
  if (lower.includes('wikipedia.org/wiki/')) {
      return { valid: false, reason: 'Wikipedia Article Page' };
  }

  if (lower.startsWith('data:')) return { valid: false, reason: 'Data URI' };

  // 4. Reject vector graphics, icons and documents
  if (lower.endsWith('.svg') || lower.endsWith('.ico')) return { valid: false, reason: 'Vector/Icon extension' };
  if (lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.docx')) return { valid: false, reason: 'Document extension' };
  if (lower.includes('favicon') || lower.includes('logo')) return { valid: false, reason: 'Logo/Favicon in URL' };

  // 5. Reject tiny thumbnails specific sizes (Strict check to avoid false positives)
  if (lower.includes('/50x50/') || lower.includes('_50x50.') || lower.includes('.32x32.')) return { valid: false, reason: 'Thumbnail dimensions in URL' };

  return { valid: true }; 
};

/**
 * Helper to extract URLs via Regex from text
 */
const extractUrlsByRegex = (text: string): SearchResult[] => {
    const urlRegex = /https?:\/\/[^\s"<>\[\]\(\)]+/gi;
    const matches = text.match(urlRegex);
    if (!matches) return [];
    
    const potentialUrls = [...new Set(matches)];
    const validResults: SearchResult[] = [];

    potentialUrls.forEach((url, i) => {
        let cleanUrl = url.replace(/["),;]$/, '');
        cleanUrl = cleanUrl.replace(/\.$/, '');
        
        if (isLikelyImageUrl(cleanUrl).valid) {
            validResults.push({
                url: cleanUrl,
                title: `Image Result ${i + 1}`,
                source: 'Web Search'
            });
        }
    });
    
    return validResults;
};

/**
 * Cleans the product name from logistical noise.
 */
const cleanSearchQuery = (name: string): string => {
    let clean = name;
    
    // Remove logistical terms/dates
    const badWords = [
        'i morgon', 'idag', 'imorgon', 'i övermorgon', 'övermorgon', 
        'vikt', 'kg', 'fp', 'förp', 'pack', 'st', 'klass 1', 'kl 1', 'klass1'
    ];

    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        clean = clean.replace(regex, '');
    });

    // Remove specific quantity patterns
    clean = clean.replace(/\b\d+\s*(kg|g|st|förp|pack|ml|cl|l|dl)\b/gi, '');
    
    // Remove countries
    clean = clean.replace(/\b(sverige|spanien|holland|italien|frankrike|tyskland|polen|marocko|israel|sydafrika|kenya|peru|chile|ecuador|costa rica|dominikanska republiken)\b/gi, '');

    clean = clean.replace(/[^a-zA-Z0-9åäöÅÄÖ\-\s]/g, '');
    return clean.replace(/\s+/g, ' ').trim();
};

const optimizeQuery = (query: string): string => {
    return cleanSearchQuery(query);
};

/**
 * Perform a Google Custom Search Engine (CSE) request.
 */
const searchViaCSE = async (query: string): Promise<SearchResult[]> => {
    if (!searchConfig || !searchConfig.apiKey) throw new Error("Search config missing or API key invalid");
    if (cseQuotaExceeded) throw new Error("CSE Quota Exceeded (Circuit Open)");
    if (!query || query.trim() === '') return [];

    const endpoint = `https://customsearch.googleapis.com/customsearch/v1`;
    const params = new URLSearchParams({
        key: searchConfig.apiKey,
        cx: searchConfig.cx,
        q: query,
        searchType: 'image',
        num: '10', 
        safe: 'active',
        gl: 'se',
        hl: 'sv'
    });

    logger.info(`[Verbose] CSE Request: "${query}"`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal });
        
        if (!response.ok) {
            let errorDetails = '';
            try {
                const errJson = await response.json();
                errorDetails = errJson?.error?.message || response.statusText;
            } catch(e) {
                errorDetails = response.statusText;
            }

            logger.error(`[CSE] API Error: ${response.status} - ${errorDetails}`);

            if (response.status === 429 || errorDetails.toLowerCase().includes('quota')) {
                cseQuotaExceeded = true;
                logger.warn('Google Search Quota Exceeded. Switching to Gemini only.');
            }
            
            throw new Error(`CSE Error ${response.status}: ${errorDetails}`);
        }

        const data = await response.json();
        const rawCount = data.items?.length || 0;
        logger.info(`[Verbose] CSE Raw items returned: ${rawCount}`);

        if (!data.items) {
            logger.warn(`[CSE] No items returned for "${query}"`);
            return [];
        }

        const filtered = data.items
            .map((item: any) => {
                const check = isLikelyImageUrl(item.link);
                if (!check.valid) {
                    logger.warn(`[Verbose] Filter Blocked: ${item.link} | Reason: ${check.reason}`);
                    return null;
                }
                logger.info(`[Verbose] Candidate OK: ${item.link.substring(0, 50)}...`);
                return {
                    url: item.link, 
                    title: item.title || item.snippet || 'CSE Result',
                    source: item.displayLink || 'Google Search'
                };
            })
            .filter((item: any) => item !== null);

        logger.success(`[CSE] Valid results after filter: ${filtered.length}`);
        return filtered;

    } catch (e: any) {
        if (e.name === 'AbortError') {
             logger.error(`[CSE] Search timed out for query: "${query}"`);
        }
        throw e;
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * Searches for images using either Google CSE or Gemini Grounding.
 */
export const searchProductImages = async (
  productName: string, 
  brand: string = '',
  description: string, 
  isRetry: boolean = false,
  customQuery?: string
): Promise<SearchResult[]> => {
  
  const optimizedName = optimizeQuery(productName);
  let queryToUse = customQuery || optimizedName;

  if (!customQuery && brand && brand.trim() !== '') {
      const cleanBrand = cleanSearchQuery(brand);
      if (!optimizedName.toLowerCase().includes(cleanBrand.toLowerCase())) {
          queryToUse = `${optimizedName} ${cleanBrand}`;
      }
  }

  // --- STRATEGY 1: Google Custom Search ---
  if (isSearchConfigured() && !cseQuotaExceeded) {
      try {
          let results = await searchViaCSE(queryToUse);
          
          if (results.length < 2 && !customQuery) {
             const broadQuery = `${optimizedName} produkt`;
             logger.info(`[CSE] Few results, trying broad: "${broadQuery}"`);
             try {
                const broadResults = await searchViaCSE(broadQuery);
                const existingUrls = new Set(results.map(r => r.url));
                const newResults = broadResults.filter(r => !existingUrls.has(r.url));
                results = [...results, ...newResults];
             } catch (e) {
                // Ignore secondary search errors
             }
          }

          if (results.length > 0) {
              return results;
          }
      } catch (cseError: any) {
          logger.warn("CSE Search failed, falling back to Gemini", { message: cseError.message });
      }
  } else if (!isSearchConfigured()) {
      logger.info("CSE not configured, using Gemini Grounding");
  }

  // --- STRATEGY 2: Gemini Grounding ---
  const performGeminiSearch = async (query: string, temperature: number, stage: string): Promise<SearchResult[]> => {
      const prompt = `
      ${SWEDISH_GROCERY_CONTEXT}
      Task: Find direct public image URLs for the requested product: "${query}".
      Instructions:
      1. Search for this product on Swedish e-commerce sites.
      2. Extract the direct link to the high-resolution product image.
      3. Return a JSON list of objects with "url", "title", "source".
      `;

      try {
        logger.info(`[Gemini Search] Stage: ${stage}, Query: "${query}"`);
        const response = await ai.models.generateContent({
            model: GEMINI_TEXT_MODEL,
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: SYSTEM_INSTRUCTION_SEARCH,
                temperature: temperature,
            },
        });

        const allResults = new Map<string, SearchResult>();

        // 1. Grounding Metadata
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
            chunks.forEach((c: any) => {
                const web = c.web;
                if (web && web.uri) { 
                    const check = isLikelyImageUrl(web.uri);
                    if (check.valid) {
                        allResults.set(web.uri, {
                            url: web.uri,
                            title: web.title || 'Result',
                            source: 'Google Grounding'
                        });
                    } else {
                        logger.warn(`[Gemini Grounding Blocked] ${web.uri} Reason: ${check.reason}`);
                    }
                }
            });
        }

        // 2. Text / Regex Fallback
        if (response.text) {
             const regexResults = extractUrlsByRegex(response.text);
             regexResults.forEach(r => {
                 if (!allResults.has(r.url)) allResults.set(r.url, r);
             });
        }
        return Array.from(allResults.values());
      } catch (error: any) {
        logger.warn(`Gemini Search attempt failed for stage: ${stage}`, error.message);
        return [];
      }
  };

  let results: SearchResult[] = [];
  
  if (customQuery) {
     return await performGeminiSearch(customQuery, 0.4, 'CUSTOM');
  }

  const results1 = await performGeminiSearch(queryToUse, 0.3, 'SPECIFIC');
  results = [...results, ...results1];

  if (results.length < 2) {
      const query = `${queryToUse} produkt`; 
      const results2 = await performGeminiSearch(query, 0.5, 'STORE_FOCUSED');
      results = [...results, ...results2];
  }

  return results.slice(0, 25);
};

export const editProductImage = async (
  base64Image: string | null, 
  prompt: string, 
  mimeType: string = 'image/png'
): Promise<string | null> => {
  try {
    logger.info('Generating/Editing image', { prompt });
    const parts: any[] = [{ text: prompt }];

    if (base64Image) {
      const cleanData = base64Image.includes('base64,') 
        ? base64Image.split('base64,')[1] 
        : base64Image;

      parts.unshift({
        inlineData: {
          mimeType: mimeType,
          data: cleanData,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_EDIT_MODEL,
      contents: { parts: parts },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
           return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error: any) {
    logger.error("Image generation/edit failed", error.message);
    throw error;
  }
};

export const generateProductImage = async (productName: string): Promise<string> => {
    const cleanName = cleanSearchQuery(productName);
    const prompt = `Professional studio photography of fresh ${cleanName}, pure white background, high resolution, soft commercial lighting, delicious looking.`;
    
    logger.info('Generating fallback image from scratch', { prompt });
    
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_IMAGE_EDIT_MODEL,
            contents: { parts: [{ text: prompt }] }
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
            for (const part of candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    logger.success('Fallback image generation successful');
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        throw new Error("No image data in generation response");
    } catch (error: any) {
        logger.error('Fallback generation failed', error.message);
        throw error;
    }
};

export const urlToBase64 = async (url: string, timeoutMs: number = 8000): Promise<string> => {
  logger.info(`[Verbose] Download Start: ${url.substring(0, 50)}... (Timeout: ${timeoutMs}ms)`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  const proxyUrl = `${CORS_PROXY_BASE}${encodeURIComponent(url)}`;

  const tryFetch = async (targetUrl: string): Promise<Blob> => {
    logger.info(`[Verbose] Fetching URL: ${targetUrl.substring(0, 60)}...`);
    const response = await fetch(targetUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    logger.info(`[Verbose] Response Content-Type: ${contentType}`);
    
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      logger.warn(`[Verbose] Download Fail: URL returned HTML: ${targetUrl}`);
      throw new Error('URL_IS_HTML');
    }

    const blob = await response.blob();
    logger.info(`[Verbose] Blob received. Type: ${blob.type}, Size: ${Math.round(blob.size / 1024)} KB`);

    if (!blob.type.startsWith('image/')) {
      if (blob.size > 100000) {
        logger.warn(`[Verbose] Download Fail: Invalid blob type: ${blob.type}`);
        throw new Error('INVALID_IMAGE_DATA');
      }
    }

    return blob;
  };

  try {
    let blob: Blob;

    try {
      blob = await tryFetch(url);
      logger.info(`[Verbose] Direct fetch succeeded`);
    } catch (directError: any) {
      if (directError.message === 'URL_IS_HTML' || 
          directError.message === 'INVALID_IMAGE_DATA' ||
          directError.name === 'AbortError') {
        throw directError;
      }

      logger.info(`[Verbose] Direct fetch failed (${directError.message}), trying proxy...`);
      // Only use proxy if direct failed and it wasn't a fatal error
      
      try {
        blob = await tryFetch(proxyUrl);
        logger.info(`[Verbose] Proxy fetch succeeded`);
      } catch (proxyError: any) {
        if (proxyError.message === 'URL_IS_HTML' || proxyError.message === 'INVALID_IMAGE_DATA') {
          throw proxyError;
        }
        throw new Error(`CORS_ERROR: Both direct and proxy failed`);
      }
    }

    return await blobToDataUrl(blob);

  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn(`[Verbose] Download TIMEOUT (${timeoutMs}ms) for ${url}`);
      throw new Error('TIMEOUT');
    }
    logger.warn(`[Verbose] Download Failed: ${error.message}`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
          const res = reader.result as string;
          if (res && res.startsWith('data:text/html')) {
              reject(new Error('URL_IS_HTML'));
          } else {
              resolve(res);
          }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
};