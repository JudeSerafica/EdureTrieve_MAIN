const express = require('express');
const router = express.Router();
const { saveChatEntry, getChatHistory, deleteChatEntriesByConversationId } = require('../model/userModel');
const authenticateToken = require('../middleware/authMiddleware');

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

module.exports = router;

