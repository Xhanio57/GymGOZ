const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

// Database bağlantısı
const connectDB = require('./config/database');
connectDB();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// View Engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Routes
app.use(require('./routes/viewRoutes'));
app.use(require('./routes/productRoutes'));
app.use(require('./routes/salesRoutes'));

// Placeholder Image Generator
app.get('/images/placeholder/:text', (req, res) => {
  const text = decodeURIComponent(req.params.text);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="#e5e7eb"/>
      <text x="100" y="100" font-size="16" font-family="Arial" text-anchor="middle" fill="#6b7280" dominant-baseline="middle">
        ${text.substring(0, 20)}
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

// Global Hata Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Sunucu hatası: ' + err.message
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
