const multer  = require('multer');
const path    = require('path');
const crypto  = require('crypto');

let storage;

if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  // Cloudinary auto-configures from CLOUDINARY_URL env var
  storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'restaurantos',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
    },
  });

  console.log('☁️  Image storage: Cloudinary');
} else {
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      const name = crypto.randomBytes(16).toString('hex');
      cb(null, `${name}${ext}`);
    },
  });
  console.log('💾  Image storage: Local disk');
}

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = upload;
