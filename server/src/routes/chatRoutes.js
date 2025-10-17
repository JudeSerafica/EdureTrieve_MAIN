import express from 'express';
const router = express.Router();
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { saveChatEntry, getChatHistory, deleteChatEntriesByConversationId } from '../model/userModel.js';
import { extractFromImage } from '../utils/textExtractor.js';
import authenticateToken from '../middleware/authMiddleware.js';
import { generateContent } from '../model/Model.js';

// Configure multer for image uploads
const chatImageUpload = multer({
  dest: 'uploads/chat-images/',
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for chat images
});

// POST /api/chat/save
router.post('/save', authenticateToken, async (req, res) => {
  const { prompt, response, conversationId, timestamp } = req.body;
  const userId = req.user.id; // ✅ FIXED

  if (!userId || !prompt || !response || !conversationId || !timestamp) {
    return res.status(400).json({ error: 'Missing userId, prompt, response, conversationId, or timestamp.' });
  }

  try {
    await saveChatEntry(userId, prompt, response, conversationId, timestamp);
    res.status(200).json({ message: 'Chat entry saved successfully.' });
  } catch (error) {
    console.error('Error in /api/chat/save:', error);
    res.status(500).json({ error: 'Failed to save chat entry.' });
  }
});

// GET /api/chat/history
router.get('/history', authenticateToken, async (req, res) => {
  const userId = req.user.id; // ✅ FIXED

  if (!userId) return res.status(400).json({ error: 'Missing userId.' });

  try {
    const history = await getChatHistory(userId);
    res.status(200).json({ chatHistory: history });
  } catch (error) {
    console.error('Error in /api/chat/history:', error);
    res.status(500).json({ error: 'Failed to retrieve chat history.' });
  }
});

// DELETE /api/chat/delete/:conversationId
router.delete('/delete/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id; // ✅ FIXED

  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'Missing userId or conversationId.' });
  }

  try {
    const deletedCount = await deleteChatEntriesByConversationId(userId, conversationId);
    if (deletedCount === 0) {
      return res.status(404).json({ message: `No chat messages found for conversation ID: ${conversationId}.` });
    }
    res.status(200).json({ message: `Successfully deleted ${deletedCount} chat entries.` });
  } catch (error) {
    console.error('Error in /api/chat/delete:', error);
    res.status(500).json({ error: 'Failed to delete chat entries.', details: error.message });
  }
});

// POST /api/chat/process-image
router.post('/process-image', chatImageUpload.single('image'), async (req, res) => {
  try {
    const { conversationId, prompt } = req.body;
    const userId = 'local-user'; // Mock user ID for localStorage approach
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required.' });
    }

    console.log('Processing chat image:', {
      userId,
      conversationId,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size
    });

    // Extract text from the uploaded image using OCR
    const filePath = path.join(process.cwd(), 'uploads/chat-images', file.filename);
    let extractedText = '';

    try {
      extractedText = await extractFromImage(filePath);
      console.log('OCR extraction successful, text length:', extractedText.length);
    } catch (ocrError) {
      console.error('OCR extraction failed:', ocrError);
      // Continue with empty text if OCR fails
      extractedText = '[Image uploaded - OCR processing failed]';
    }

    // Clean up the uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('Failed to clean up uploaded file:', cleanupError);
    }

    // Generate AI response based on user's question + extracted text
    const aiPrompt = prompt
      ? `${prompt}\n\nHere is the extracted text from the uploaded image:\n\n"${extractedText}"\n\nPlease answer the question using the image content.`
      : `The user uploaded an image. Here is the extracted text from the image:\n\n"${extractedText}"\n\nPlease analyze this content and provide helpful insights or answer any questions the user might have about it.`;


    const aiResponse = await generateContent(aiPrompt);

    // Create timestamp
    const now = Date.now();
    const timestamp = {
      _seconds: Math.floor(now / 1000),
      _nanoseconds: (now % 1000) * 1_000_000
    };

    // Save the image message and AI response to chat history
    const imageMessage = {
      type: 'user',
      text: `[Image uploaded] ${extractedText}`,
      timestamp,
      conversationId,
      imageUrl: null // We don't store the image, just process it
    };

    const aiMessage = {
      type: 'ai',
      text: aiResponse,
      timestamp: {
        _seconds: Math.floor(Date.now() / 1000),
        _nanoseconds: (Date.now() % 1000) * 1_000_000
      },
      conversationId
    };

    // Return processed data - frontend will handle localStorage
    res.status(200).json({
      message: 'Image processed successfully',
      extractedText,
      aiResponse,
      conversationId
    });

  } catch (error) {
    console.error('Error processing chat image:', error);
    res.status(500).json({
      error: 'Failed to process image',
      details: error.message
    });
  }
});

export default router;



