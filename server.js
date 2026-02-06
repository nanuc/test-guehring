const express = require('express');
const multer = require('multer');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'products.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Basic Auth credentials
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'guehring2026';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${nanoid(10)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    cb(ok ? null : new Error('Nur Bilddateien erlaubt'), ok);
  }
});

// --- Auth Middleware ---
function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentifizierung erforderlich');
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Ungültige Anmeldedaten');
}

// Admin panel (protected)
app.use('/admin', basicAuth, express.static(path.join(__dirname, 'admin')));

// --- Data Helpers ---
function readProducts() {
  const data = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(data);
}

function writeProducts(products) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2), 'utf-8');
}

// --- API Routes ---

// GET all products (public)
app.get('/api/products', (req, res) => {
  try {
    const products = readProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Laden der Produkte' });
  }
});

// POST new product (protected)
app.post('/api/products', basicAuth, upload.single('image'), (req, res) => {
  try {
    const products = readProducts();
    const { name, tag, description, detailDescription, specs, existingImage } = req.body;

    const product = {
      id: nanoid(8),
      name,
      tag: tag || '',
      description: description || '',
      detailDescription: detailDescription || '',
      image: req.file ? `/uploads/${req.file.filename}` : (existingImage || ''),
      specs: specs ? JSON.parse(specs) : []
    };

    products.push(product);
    writeProducts(products);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Erstellen des Produkts' });
  }
});

// PUT update product (protected)
app.put('/api/products/:id', basicAuth, upload.single('image'), (req, res) => {
  try {
    const products = readProducts();
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Produkt nicht gefunden' });

    const { name, tag, description, detailDescription, specs, existingImage } = req.body;

    if (name !== undefined) products[idx].name = name;
    if (tag !== undefined) products[idx].tag = tag;
    if (description !== undefined) products[idx].description = description;
    if (detailDescription !== undefined) products[idx].detailDescription = detailDescription;
    if (specs) products[idx].specs = JSON.parse(specs);
    if (req.file) {
      // Delete old uploaded image if it was a local file
      const oldImage = products[idx].image;
      if (oldImage && oldImage.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, oldImage);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      products[idx].image = `/uploads/${req.file.filename}`;
    } else if (existingImage !== undefined) {
      products[idx].image = existingImage;
    }

    writeProducts(products);
    res.json(products[idx]);
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Produkts' });
  }
});

// DELETE product (protected)
app.delete('/api/products/:id', basicAuth, (req, res) => {
  try {
    let products = readProducts();
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Produkt nicht gefunden' });

    // Delete uploaded image if local
    const image = products[idx].image;
    if (image && image.startsWith('/uploads/')) {
      const imgPath = path.join(__dirname, image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    products.splice(idx, 1);
    writeProducts(products);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Fehler beim Löschen des Produkts' });
  }
});

// Image upload endpoint (protected)
app.post('/api/upload', basicAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Start server
app.listen(PORT, () => {
  console.log(`Gühring CMS läuft auf http://localhost:${PORT}`);
  console.log(`Admin-Panel: http://localhost:${PORT}/admin`);
  console.log(`Login: ${ADMIN_USER} / ${ADMIN_PASS}`);
});
