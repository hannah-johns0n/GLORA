const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadPath = 'public/uploads/products';
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/products'); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  try {
    console.log('Processing file:', file.originalname);
    console.log('MIME type:', file.mimetype);
    
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      console.log('File accepted:', file.originalname);
      return cb(null, true);
    } else {
      const error = new Error(`Invalid file type: ${file.originalname}. Only images (jpeg, jpg, png, gif, webp) are allowed.`);
      console.error('File rejected:', error.message);
      return cb(error, false);
    }
  } catch (error) {
    console.error('Error in fileFilter:', error);
    return cb(error, false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
  files: 4, 
  fileSize: 5 * 1024 * 1024,
  fields: 200,    
  parts: 250      
},
  preservePath: true
});

const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  } else if (err) {
    console.error('File upload error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'An error occurred during file upload'
    });
  }
  next();
};

module.exports = {
  upload,
  handleMulterErrors
};
