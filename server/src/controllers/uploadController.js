const moduleModel = require('../model/moduleModel');
const { extractTextFromFile, extractFromImage } = require('../utils/textExtractor');
const path = require('path');
const fs = require('fs');

exports.uploadModule = async (req, res) => {
  try {
    const { title, description } = req.body;
    const file = req.file;

    // Validate input
    if (!title || !description) {
      return res.status(400).json({ message: 'Module title and description are required.' });
    }

    // Validate authentication (req.user.id from Supabase JWT middleware)
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    let extractedContent = description; // Default to description if no file

    // If a file is uploaded, extract text content
    if (file) {
      try {
        const filePath = path.join(__dirname, '../../uploads', file.filename);

        // Check if it's an image file for OCR processing
        const isImage = file.mimetype.startsWith('image/');
        if (isImage) {
          extractedContent = await extractFromImage(filePath);
        } else {
          extractedContent = await extractTextFromFile(filePath, file.mimetype);
        }

        // Clean up the uploaded file after extraction
        fs.unlinkSync(filePath);
      } catch (extractionError) {
        console.warn('File extraction failed, using description only:', extractionError.message);
        // Continue with description if extraction fails
      }
    }

    // Prepare new module data
    const newModuleData = {
      title,
      description: extractedContent,
      uploadedBy: req.user.id,
    };

    // Save to Supabase
    const createdModule = await moduleModel.createModule(newModuleData);

    res.status(201).json({
      message: 'Module uploaded successfully.',
      moduleId: createdModule.id,
    });
  } catch (error) {
    console.error('Error uploading module:', error);
    res.status(500).json({ message: `Error uploading module: ${error.message}` });
  }
};
