const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
require('dotenv').config();

// Database bağlantısı
const connectDB = require('./config/database');
const seedData = require('./config/seedData');
connectDB().then(() => {
  seedData();
});

const app = express();

const session = require('express-session');

// ===== SECURITY MIDDLEWARE =====

// Helmet — HTTP güvenlik başlıkları (XSS, clickjacking, CSP vb.)
app.use(helmet({
  contentSecurityPolicy: false, // EJS inline scripts/styles için devre dışı
  crossOriginEmbedderPolicy: false
}));

// NoSQL Injection koruması
app.use(mongoSanitize());

// Body parsers
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static('public'));

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10, // Pencere başına 10 deneme
  message: { success: false, message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Çok fazla ödeme denemesi. Lütfen bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 dakika
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', generalApiLimiter);

// Session Setup — güvenli ayarlar
app.use(session({
  secret: process.env.SESSION_SECRET || 'GymGOZ_Fallback_Secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 Hours
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Expose auth state to EJS templates
app.use((req, res, next) => {
  res.locals.isAdmin = req.session && req.session.isAdmin;
  res.locals.customerName = req.session && req.session.customerName;
  res.locals.customerId = req.session && req.session.customerId;
  next();
});

// Global Admin & Mutation API Firewall
app.use((req, res, next) => {
  const isApiMutation = req.path.startsWith('/api/') && req.method !== 'GET' && !req.path.startsWith('/api/checkout/');
  const isAdminPath = req.path.startsWith('/admin') || req.path.startsWith('/pos');
  const isAdminApi = req.path.startsWith('/api/admin/');

  if (isApiMutation || isAdminPath || isAdminApi) {
    if (req.session && req.session.isAdmin) {
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Yetkisiz erişim. Lütfen giriş yapın.' });
    }
    return res.redirect('/login');
  }
  next();
});

// Login Page (GET)
app.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin');
  }
  res.render('login', { title: 'Yönetici Girişi', error: null });
});

// Login Action (POST) — rate limited
app.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === expectedUser && password === expectedPass) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }

  res.render('login', {
    title: 'Yönetici Girişi',
    error: 'Hatalı kullanıcı adı veya şifre!'
  });
});

// Logout Action (GET)
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Oturum kapatma hatası:', err);
    }
    res.redirect('/');
  });
});

// View Engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Routes
app.use(require('./routes/viewRoutes'));
app.use(require('./routes/productRoutes'));
app.use(require('./routes/salesRoutes'));
app.use(require('./routes/paymentRoutes'));
app.use(require('./routes/customerRoutes'));

// Apply payment rate limiter
app.use('/api/checkout/initiate', paymentLimiter);

// Placeholder Image Generator — sanitized
app.get('/images/placeholder/:text', (req, res) => {
  const rawText = decodeURIComponent(req.params.text);
  // Sanitize: strip any HTML/XML tags and limit length
  const text = rawText.replace(/[<>&"'/]/g, '').substring(0, 20);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="#e5e7eb"/>
      <text x="100" y="100" font-size="16" font-family="Arial" text-anchor="middle" fill="#6b7280" dominant-baseline="middle">
        ${text}
      </text>
    </svg>
  `);
});

// 404 Hatası
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Sayfa Bulunamadı'
  });
});

// Global Hata Handler — production'da iç hata detayı sızdırmaz
app.use((err, req, res, next) => {
  console.error(err.stack);
  const message = process.env.NODE_ENV === 'production'
    ? 'Bir sunucu hatası oluştu.'
    : 'Sunucu hatası: ' + err.message;
  res.status(500).json({
    success: false,
    message
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Öz Spor & Outdoor POS uygulaması ${PORT} portunda çalışıyor`);
  console.log(`   Admin Panel: http://localhost:${PORT}/admin/add-product`);
  console.log(`   Stok Listesi: http://localhost:${PORT}/admin/inventory`);
  console.log(`   POS Satış: http://localhost:${PORT}/pos\n`);
});
