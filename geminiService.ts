import { GoogleGenAI } from "@google/genai";
import { GEMINI_TEXT_MODEL, GEMINI_IMAGE_EDIT_MODEL, SYSTEM_INSTRUCTION_SEARCH } from "./constants";
import { SearchResult } from "./types";
import { logger } from "./logger";

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Search Config
let searchConfig: { apiKey: string, cx: string } | null = null;
let cseQuotaExceeded = false; // Circuit breaker

export const setSearchConfig = (apiKey: string, cx: string) => {
    // Basic trimming to prevent copy-paste errors
    searchConfig = { apiKey: apiKey.trim(), cx: cx.trim() };
    cseQuotaExceeded = false;
    logger.info('Search API configured');
};

export const isSearchConfigured = () => {
    return searchConfig !== null && searchConfig.apiKey !== '' && searchConfig.cx !== '';
};

// Domains to explicitly ignore
const BLOCKED_DOMAINS: string[] = [];

// Priority domains for Swedish grocery context
const SWEDISH_GROCERY_CONTEXT = `
Context: You are searching for product images for a Swedish grocery e-commerce store.
Prioritize finding images from these retailers if possible:
- Mathem, Coop, ICA, Willys, Hemköp, City Gross, Matspar, Axfood, Menigo, Martin & Servera.
`;

/**
 * Helper to check if a URL looks like a VALID product image.
 * PERMISSIVE MODE: Defaults to TRUE unless explicitly known to be bad (vectors, icons).
 */
const isLikelyImageUrl = (url: string): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  
  // 1. Blocked Domains check
  if (BLOCKED_DOMAINS.some(domain => lower.includes(domain))) {
      return false;
  }

  if (lower.startsWith('data:')) return false;

  // 2. Reject vector graphics, icons and documents
  if (lower.endsWith('.svg') || lower.endsWith('.ico')) return false;
  if (lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.docx')) return false;
  if (lower.includes('favicon') || lower.includes('logo')) return false;

  // 3. Reject tiny thumbnails specific sizes
  if (lower.includes('50x50') || lower.includes('32x32')) return false;

  return true; 
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
        
        if (isLikelyImageUrl(cleanUrl)) {
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
 * Cleans the product name from logistical noise but KEEPS semantic visual identifiers.
 */
const cleanSearchQuery = (name: string): string => {
    let clean = name;
    
    // Remove ONLY purely logistical terms/dates that confuse the search
    const badWords = [
        'i morgon', 'idag', 'imorgon', 'i övermorgon', 'övermorgon', // Delivery terms
        'vikt', 'kg', 'fp', 'förp', 'pack', 'st', // Logistical units
        'ursprung', 'sverige', 'holland', 'spanien', // Origins
        'klass 1', 'kl 1', 'klass1' // Grading
    ];

    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        clean = clean.replace(regex, '');
    });

    // Specific fix for "1st", "2st" etc which are common in Swedish
    clean = clean.replace(/\b\d+st\b/gi, '');

    clean = clean.replace(/[^a-zA-Z0-9åäöÅÄÖ\-\s]/g, '');
    return clean.replace(/\s+/g, ' ').trim();
};

const optimizeQuery = (query: string): string => {
    const cleaned = cleanSearchQuery(query);
    const lower = cleaned.toLowerCase();
    const words = cleaned.split(/\s+/).filter(w => w.trim().length > 0);
    
    // Utökad lista på generiska items som ofta returnerar Wikipedia
    const generics = [
        'apelsin', 'banan', 'äpple', 'päron', 'tomat', 'gurka', 'potatis', 'lök', 
        'morot', 'citron', 'lime', 'mango', 'avokado', 'paprika', 'kål', 'sallad', 
        'melon', 'druvor', 'jordgubbar', 'hallon', 'blåbär', 'körsbär', 'plommon',
        'broccoli', 'spenat', 'selleri', 'purjolök', 'vitlök', 'ingefära', 'dill',
        'persilja', 'basilika', 'oregano', 'timjan', 'rosmarin', 'mynta', 'koriander',
        'ananas', 'kiwi', 'fikon', 'dadlar', 'oliver', 'kapris', 'champinjoner',
        'zucchini', 'aubergine', 'fänkål', 'rödbetor', 'palsternacka', 'rädisor'
    ];
    
    // Om det är 1-2 ord och matchar generisk mat, lägg till kontext
    if (words.length <= 2) {
        const isGeneric = generics.some(g => lower.includes(g));
        if (isGeneric) {
            return `${cleaned} frukt grönsak produkt butik`;
        }
    }
    
    // Om query är väldigt kort, lägg till kontext
    if (cleaned.length < 10) {
        return `${cleaned} produkt`;
    }
    
    return cleaned;
};

/**
 * Perform a Google Custom Search Engine (CSE) request.
 */
const searchViaCSE = async (query: string): Promise<SearchResult[]> => {
    if (!searchConfig) throw new Error("Search config missing");
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
        gl: 'se', // Geolocation: Sweden
        hl: 'sv'  // Host Language: Swedish
    });

    logger.info(`[CSE Search] Query: "${query}"`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout for search response

    try {
        const response = await fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal });
        
        if (!response.ok) {
            // Read the detailed error body from Google
            let errorDetails = '';
            try {
                const errJson = await response.json();
                errorDetails = errJson?.error?.message || response.statusText;
            } catch(e) {
                errorDetails = response.statusText;
            }

            if (response.status === 429 || errorDetails.includes('quota')) {
                cseQuotaExceeded = true;
                logger.warn('Google Search Quota Exceeded. Switching to Gemini only.');
            }
            
            throw new Error(`CSE Error ${response.status}: ${errorDetails}`);
        }

        const data = await response.json();
        if (!data.items) return [];

        return data.items.map((item: any) => ({
            url: item.link, // Correct: direct image link
            title: item.title || item.snippet || 'CSE Result',
            source: item.displayLink || 'Google Search'
        })).filter((r: SearchResult) => isLikelyImageUrl(r.url));
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * Searches for images using either Google CSE (if configured) or Gemini Grounding (Fallback).
 */
export const searchProductImages = async (
  productName: string, 
  brand: string = '',
  description: string, 
  isRetry: boolean = false,
  customQuery?: string
): Promise<SearchResult[]> => {
  
  // Use the optimized query builder
  const optimizedName = optimizeQuery(productName);
  let queryToUse = customQuery || optimizedName;

  // If we have a brand and it's not custom query, check if we should append it
  if (!customQuery && brand && brand.trim() !== '') {
      const cleanBrand = cleanSearchQuery(brand);
      if (!optimizedName.toLowerCase().includes(cleanBrand.toLowerCase())) {
          queryToUse = `${optimizedName} ${cleanBrand}`;
      }
  }

  // --- STRATEGY 1: Google Custom Search (Preferred) ---
  if (isSearchConfigured() && !cseQuotaExceeded) {
      try {
          let results = await searchViaCSE(queryToUse);
          
          if (results.length < 2 && !customQuery) {
             const noun = optimizedName.split(' ')[0];
             const broadQuery = `${noun} ${brand} produkt`;
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
              logger.success(`[CSE] Found ${results.length} images total`);
              return results;
          }
      } catch (cseError: any) {
          logger.warn("CSE Search failed, falling back to Gemini", { message: cseError.message });
      }
  } else if (!isSearchConfigured()) {
      logger.info("CSE not configured, using Gemini Grounding");
  }

  // --- STRATEGY 2: Gemini Grounding (Fallback) ---
  const performGeminiSearch = async (query: string, temperature: number, stage: string): Promise<SearchResult[]> => {
      const prompt = `
      ${SWEDISH_GROCERY_CONTEXT}
      Task: Find direct public image URLs for the product: "${query}".
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
                    if (isLikelyImageUrl(web.uri)) {
                        allResults.set(web.uri, {
                            url: web.uri,
                            title: web.title || 'Result',
                            source: 'Google Grounding'
                        });
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

  // Gemini Stage 1
  const results1 = await performGeminiSearch(queryToUse, 0.3, 'SPECIFIC');
  results = [...results, ...results1];

  // Gemini Stage 2
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;

  const tryFetch = async (targetUrl: string): Promise<Blob> => {
    const response = await fetch(targetUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      throw new Error('URL_IS_HTML');
    }

    const blob = await response.blob();

    // Validera att blob faktiskt är en bild
    if (!blob.type.startsWith('image/')) {
      // Om blob är stor och inte markerad som bild, troligen HTML/annat
      if (blob.size > 100000) {
        throw new Error('INVALID_IMAGE_DATA');
      }
    }

    return blob;
  };

  try {
    let blob: Blob;

    // Attempt 1: Direct fetch
    try {
      blob = await tryFetch(url);
      logger.info(`Direct fetch succeeded for ${url.substring(0, 50)}...`);
    } catch (directError: any) {
      // Om det är HTML eller timeout, kasta vidare direkt
      if (directError.message === 'URL_IS_HTML' || 
          directError.message === 'INVALID_IMAGE_DATA' ||
          directError.name === 'AbortError') {
        throw directError;
      }

      // Attempt 2: Proxy fallback för CORS-fel
      logger.info(`Direct fetch failed, trying proxy for ${url.substring(0, 50)}...`);
      try {
        blob = await tryFetch(proxyUrl);
        logger.info(`Proxy fetch succeeded`);
      } catch (proxyError: any) {
        // Om proxy också misslyckas, kasta ursprungliga felet eller proxy-felet
        if (proxyError.message === 'URL_IS_HTML' || proxyError.message === 'INVALID_IMAGE_DATA') {
          throw proxyError;
        }
        throw new Error(`CORS_ERROR: Both direct and proxy failed`);
      }
    }

    return await blobToDataUrl(blob);

  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
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
          // Extra safety check for DataURL content
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