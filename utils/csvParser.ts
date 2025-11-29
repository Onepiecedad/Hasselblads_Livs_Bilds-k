import { Product } from '../types';

export const parseCSVLine = (text: string, separator: string) => {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') {
        inQuotes = !inQuotes;
      } else if (text[i] === separator && !inQuotes) {
        let field = text.substring(start, i).trim();
        if (field.startsWith('"') && field.endsWith('"')) {
            field = field.substring(1, field.length - 1);
        }
        field = field.replace(/""/g, '"');
        result.push(field);
        start = i + 1;
      }
    }
    let lastField = text.substring(start).trim();
    if (lastField.startsWith('"') && lastField.endsWith('"')) {
        lastField = lastField.substring(1, lastField.length - 1);
    }
    lastField = lastField.replace(/""/g, '"');
    result.push(lastField);
    return result;
};

export const detectSeparator = (line: string): string => {
    const commas = (line.match(/,/g) || []).length;
    const semicolons = (line.match(/;/g) || []).length;
    return semicolons > commas ? ';' : ',';
};

export const parseCSVString = (text: string): Product[] => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const separator = detectSeparator(lines[0]);
    const headers = parseCSVLine(lines[0], separator);
    const lowerHeaders = headers.map(h => h.toLowerCase());
    
    // Auto-detect columns
    let nameIndex = lowerHeaders.findIndex(h => h.includes('namn') || h.includes('name') || h.includes('title'));
    if (nameIndex === -1) nameIndex = 0;

    let descIndex = lowerHeaders.findIndex(h => h === 'beskrivning' || h === 'description' || h.includes('short description'));
    if (descIndex === -1) {
        descIndex = lowerHeaders.findIndex(h => h.includes('beskrivning') || h.includes('desc'));
    }
    if (descIndex === -1 && headers.length > 1) descIndex = 1;

    let imgIndex = lowerHeaders.findIndex(h => h === 'bilder' || h === 'images' || h === 'image' || h === 'bild' || h.includes('image url'));
    let brandIndex = lowerHeaders.findIndex(h => h === 'varumärke' || h === 'varumärken' || h === 'brand' || h === 'tillverkare' || h === 'manufacturer');

    return lines.slice(1).map((line, index) => {
      const values = parseCSVLine(line, separator);
      const product: any = { id: `prod_${index}_${Date.now()}` };
      
      headers.forEach((header, i) => {
        product[header] = values[i] || '';
      });

      product.product_name = values[nameIndex] || 'Okänd produkt';
      product.description = values[descIndex] || '';
      product.brand = brandIndex !== -1 ? values[brandIndex] : '';
      
      product.initialImages = [];
      if (imgIndex !== -1 && values[imgIndex]) {
          const rawUrlString = values[imgIndex];
          const normalized = rawUrlString.replace(/(https?:\/\/)/g, ',$1').replace(/^,/, '');
          const urls = normalized.split(',').map((u: string) => u.trim()).filter((u: string) => u.startsWith('http'));
          product.initialImages = urls;
      }

      return product;
    });
};