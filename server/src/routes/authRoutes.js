const express = require('express');
const router = express.Router();
const { checkEmail } = require('../model/userModel');

router.post('/email-check', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Missing email.' });

  try {
    const exists = await checkEmail(email);
    res.status(200).json({ exists });
  } catch (error) {
    console.error('Error in /api/reset-password/email-check', error);
    res.status(500).json({ error: 'Failed to retrieve email' });
  }
});

module.exports = router;