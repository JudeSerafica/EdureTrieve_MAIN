import fs from 'fs';
import path from 'path';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import PPTX2Json from 'pptx2json';

console.log('[textExtractor] v2 loader active');

/**
 * Extracts text content from various file types
 * @param {string} filePath - Path to the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromFile(filePath, mimeType) {
  try {
    switch (mimeType) {
      case 'application/pdf':
        return await extractFromPDF(filePath);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractFromDOCX(filePath);
      case 'text/plain':
        return await extractFromTXT(filePath);
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return await extractFromPPTX(filePath);
      case 'image/jpeg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
        return await extractFromImage(filePath);
      default:
        throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

/**
 * Extract text from PDF files
 * Supports pdf-parse v1 (default function) and v2 (PDFParse class)
 */
async function extractFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const mod = await import('pdf-parse');

    let text = '';

    if (typeof mod?.PDFParse === 'function') {
      console.log('[textExtractor] using PDFParse class (v2)');
      const parser = new mod.PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      await parser.destroy();
      text = result?.text || '';
    } else if (typeof mod?.default === 'function') {
      console.log('[textExtractor] using default function (v1)');
      const result = await mod.default(dataBuffer);
      text = (result && typeof result === 'object' && 'text' in result) ? result.text : (typeof result === 'string' ? result : '');
    } else if (typeof mod === 'function') {
      console.log('[textExtractor] using module as function (interop)');
      const result = await mod(dataBuffer);
      text = (result && typeof result === 'object' && 'text' in result) ? result.text : (typeof result === 'string' ? result : '');
    } else {
      console.error('[textExtractor] unsupported pdf-parse export shape:', Object.keys(mod || {}));
      throw new Error('Unsupported pdf-parse export shape');
    }

    return text;
  } catch (error) {
    console.error('[textExtractor] PDF extraction error:', error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from DOCX files
 */
async function extractFromDOCX(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from TXT files
 */
async function extractFromTXT(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`TXT extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from PPTX files
 * Handles both constructor and function export styles
 */
async function extractFromPPTX(filePath) {
  try {
    let pptx;
    try {
      // Some versions expose a class
      pptx = new PPTX2Json(filePath);
    } catch (_e) {
      // Fallback: some builds expose a function default export
      const mod = await import('pptx2json');
      const fn = mod?.default ?? mod;
      pptx = await fn(filePath);
    }

    let text = '';
    if (pptx?.slides) {
      pptx.slides.forEach(slide => {
        if (slide?.text) {
          text += slide.text + '\n';
        }
      });
    }
    return text.trim();
  } catch (error) {
    throw new Error(`PPTX extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from image files using OCR
 */
async function extractFromImage(filePath) {
  let worker;
  try {
    worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(filePath);
    return text.trim();
  } catch (error) {
    throw new Error(`Image OCR extraction failed: ${error.message}`);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

export {
  extractTextFromFile,
  extractFromImage,
  extractFromPPTX
};