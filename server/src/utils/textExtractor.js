import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

/**
 * Extracts text content from various file types
 * @param {string} filePath - Path to the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromFile(filePath, mimeType) {
  try {
    const fileExtension = path.extname(filePath).toLowerCase();

    switch (fileExtension) {
      case '.pdf':
        return await extractFromPDF(filePath);
      case '.docx':
        return await extractFromDOCX(filePath);
      case '.txt':
        return await extractFromTXT(filePath);
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif':
        return await extractFromImage(filePath);
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`);
    }
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

/**
 * Extract text from PDF files
 */
async function extractFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
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
  extractFromImage
};