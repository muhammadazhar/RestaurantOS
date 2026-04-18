const multer  = require('multer');
const path = require('path');

if (!process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_CLOUD_NAME) {
  throw new Error('Cloudinary image storage is required. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.');
}

if (!process.env.CLOUDINARY_URL && (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) {
  throw new Error('Cloudinary image storage requires CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET when CLOUDINARY_URL is not set.');
}

let storage;

if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  // Cloudinary auto-configures from CLOUDINARY_URL env var
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: process.env.CLOUDINARY_FOLDER || 'restaurantos',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
    },
  });

  console.log('Image storage: Cloudinary');
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
