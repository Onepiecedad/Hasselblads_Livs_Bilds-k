export const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';
export const GEMINI_IMAGE_EDIT_MODEL = 'gemini-2.5-flash-image';
export const GEMINI_HIGH_QUALITY_MODEL = 'gemini-3-pro-image-preview';

export const CSV_REQUIRED_COLUMNS = ['product_name', 'description'];

export const SYSTEM_INSTRUCTION_SEARCH = `
Task: Find direct public image URLs for the requested product.
Output: STRICT JSON Array of objects with keys: "url", "title", "source".
No markdown formatting, just the JSON.
`;

export const TEMPLATES = [
  { 
    id: 'studio', 
    label: 'Studio', 
    icon: 'Camera',
    prompt: 'Professional studio product photography, pure white background, soft lighting, 4k, sharp focus' 
  },
  { 
    id: 'lifestyle', 
    label: 'Lifestyle', 
    icon: 'Coffee',
    prompt: 'Lifestyle photography, placed on a wooden table, cozy atmosphere, natural sunlight, depth of field' 
  },
  { 
    id: 'nature', 
    label: 'Natur', 
    icon: 'Leaf',
    prompt: 'Product placed in nature, surrounded by green leaves and stones, soft daylight, organic feel' 
  },
  { 
    id: 'minimal', 
    label: 'Minimalist', 
    icon: 'Box',
    prompt: 'Minimalist composition, solid pastel background, hard shadows, modern aesthetic' 
  },
  {
     id: 'luxury',
     label: 'Lyx',
     icon: 'Diamond',
     prompt: 'Luxury product shot, dark elegant background, cinematic lighting, gold accents, reflection on surface'
  }
];