const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const PDFDocument = require('pdfkit');
const htmlPdf = require('html-pdf');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const heicConvert = require('heic-convert');
const cloudinary = require('cloudinary').v2;

// Cloudinary Yapılandırması (Kalıcı görsel depolama)
const isCloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/products/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isHeic = ext === '.heic' || ext === '.heif';
    const filetypes = /jpeg|jpg|png|gif|webp|svg|heic|heif/;
    const mimetype = filetypes.test(file.mimetype) || (isHeic && file.mimetype === 'application/octet-stream');
    const extname = filetypes.test(ext);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Yalnızca görsel dosyaları yükleyebilirsiniz!'));
  }
});

async function convertHeicToJpeg(file) {
  if (!file) return;
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    try {
      const inputBuffer = await fs.readFile(file.path);
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 0.85
      });
      const newFilename = file.filename.replace(/\.(heic|heif)$/i, '.jpg');
      const newPath = path.join(path.dirname(file.path), newFilename);
      await fs.writeFile(newPath, outputBuffer);
      await fs.unlink(file.path);
      
      file.filename = newFilename;
      file.path = newPath;
    } catch (err) {
      console.error('HEIC conversion error:', err);
    }
  }
}

async function uploadToCloudinaryAndCleanup(file) {
  if (!file) return null;

  if (!isCloudinaryConfigured) {
    console.log('Cloudinary is not configured. Saving file locally.');
    return '/products/' + file.filename;
  }

  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'gymgoz_products'
    });

    // Clean up temporary local file
    try {
      await fs.unlink(file.path);
    } catch (unlinkErr) {
      console.error('Local temp file cleanup error:', unlinkErr);
    }

    return result.secure_url;
  } catch (err) {
    console.error('Cloudinary upload failed, falling back to local file path:', err);
    return '/products/' + file.filename;
  }
}

router.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ürünler yüklenemedi: ' + error.message });
  }
});

router.post('/api/products/:id/view', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }
    res.json({ success: true, views: product.views });
  } catch (error) {
    res.status(500).json({ success: false, message: 'İşlem başarısız: ' + error.message });
  }
});

router.post('/api/products', upload.single('imageFile'), async (req, res) => {
  try {
    await convertHeicToJpeg(req.file);
    const { name, price, category, barcode, image, description, brand, shopierLink, features, subcat, badge } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Ürün adı, fiyat ve kategori zorunludur'
      });
    }

    let imagePath = '/images/default-product.png';
    if (req.file) {
      imagePath = await uploadToCloudinaryAndCleanup(req.file);
    } else if (image && image.trim()) {
      imagePath = image.trim();
    }

    let sizeStock = [];
    if (req.body.sizes) {
      const sizesArray = Array.isArray(req.body.sizes) ? req.body.sizes : [req.body.sizes];
      sizeStock = sizesArray.map(size => {
        const stockKey = `stock_${size}`;
        const stockVal = req.body[stockKey] !== undefined ? parseInt(req.body[stockKey]) : 1;
        return {
          size,
          stock: isNaN(stockVal) ? 0 : stockVal
        };
      });
    }

    const newProduct = new Product({
      name,
      price: parseFloat(price),
      category,
      barcode: barcode && barcode.trim() ? barcode.trim() : undefined,
      image: imagePath,
      description: description || '',
      brand: brand || 'Öz Spor',
      shopierLink: shopierLink || '',
      features: Array.isArray(features) ? features : (features ? features.split(',').map(f => f.trim()) : []),
      subcat: subcat || '',
      badge: badge || '',
      sizeStock: sizeStock.length > 0 ? sizeStock : undefined
    });

    await newProduct.save();

    res.status(201).json({
      success: true,
      message: `Ürün "${name}" başarıyla eklendi. Barkod: ${newProduct.barcode}`,
      product: newProduct
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Bu barkod numarası zaten kullanılıyor'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Ürün eklenirken hata oluştu: ' + error.message
    });
  }
});

router.put('/api/products/:id', upload.single('imageFile'), async (req, res) => {
  try {
    await convertHeicToJpeg(req.file);
    const { name, price, category, image, description, discountType, discountValue, discountLabel, labelText, brand, shopierLink, features, subcat, badge } = req.body;
    
    const updateData = {
      name,
      price: parseFloat(price),
      category,
      description,
      discountType,
      discountValue: parseFloat(discountValue) || 0,
      discountLabel,
      labelText,
      brand: brand || 'Öz Spor',
      shopierLink: shopierLink || '',
      features: Array.isArray(features) ? features : (features ? features.split(',').map(f => f.trim()) : []),
      subcat: subcat || '',
      badge: badge || ''
    };

    if (req.file) {
      updateData.image = await uploadToCloudinaryAndCleanup(req.file);
    } else if (image !== undefined) {
      updateData.image = image || '/images/default-product.png';
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    res.json({
      success: true,
      message: 'Ürün başarıyla güncellendi',
      product
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Güncelleme hatası: ' + error.message });
  }
});

router.patch('/api/products/:id/size-stock', async (req, res) => {
  try {
    const { size, quantity } = req.body;

    if (!size || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Beden ve miktar zorunludur'
      });
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    const sizeItem = product.sizeStock.find(s => s.size === size);

    if (!sizeItem) {
      return res.status(404).json({ success: false, message: 'Beden bulunamadı' });
    }

    sizeItem.stock += parseInt(quantity);

    if (sizeItem.stock < 0) {
      sizeItem.stock = 0;
    }

    await product.save();

    res.json({
      success: true,
      message: `${size} bedeninin stoku güncellendi: ${sizeItem.stock}`,
      product
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Stok güncelleme hatası: ' + error.message });
  }
});

router.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    res.json({
      success: true,
      message: `Ürün "${product.name}" başarıyla silindi`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Silme hatası: ' + error.message });
  }
});

// PDF İndir - Tüm Ürünleri (HTML-PDF ile Türkçe Desteği)
router.get('/api/products/export/pdf/:includeStock', async (req, res) => {
  try {
    const products = await Product.find().sort({ name: 1 });
    const includeStock = req.params.includeStock === 'true';

    let totalStock = 0;
    let totalRevenue = 0;

    const tableRows = products.map((p, idx) => {
      const sizeStock = Array.isArray(p.sizeStock) ? p.sizeStock : [];
      const prodTotalStock = sizeStock.reduce((a, b) => a + (b.stock || 0), 0);
      const prodRevenue = Number(p.price || 0) * prodTotalStock;

      totalStock += prodTotalStock;
      totalRevenue += prodRevenue;

      const sizeDetails = sizeStock
        .filter(s => (s.stock || 0) > 0)
        .map(s => `${s.size}:${s.stock}`)
        .join(' • ') || '-';

      const stockColor = prodTotalStock === 0
        ? '#dc2626'
        : prodTotalStock < 10
          ? '#f59e0b'
          : '#10b981';

      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

      return `
        <tr style="background-color: ${bgColor};">
          <td class="center">${idx + 1}</td>
          <td class="name-cell">${p.name || ''}</td>
          <td class="center">${p.category || ''}</td>
          <td class="center barcode-cell">${p.barcode || ''}</td>
          <td class="right">${Number(p.price || 0).toFixed(2)} TL</td>
          <td class="center stock-cell" style="color:${stockColor};">${prodTotalStock}</td>
          ${includeStock ? `<td class="sizes-cell">${sizeDetails}</td>` : ''}
        </tr>
      `;
    }).join('');

    const colgroup = includeStock
      ? `
        <th style="width:6%;">#</th>
        <th style="width:30%;">Ürün Adı</th>
        <th style="width:16%;">Kategori</th>
        <th style="width:18%;">Barkod</th>
        <th style="width:12%;">Fiyat</th>
        <th style="width:8%;">Stok</th>
        <th style="width:30%;">Beden Detayları</th>
      `
      : `
        <th style="width:7%;">#</th>
        <th style="width:39%;">Ürün Adı</th>
        <th style="width:20%;">Kategori</th>
        <th style="width:20%;">Barkod</th>
        <th style="width:14%;">Fiyat</th>
        <th style="width:10%;">Stok</th>
      `;

    const html = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>Stok Envanteri</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            color: #1f2937;
            font-size: 10px;
          }
          h1 {
            text-align: center;
            font-size: 18px;
            margin: 0 0 4px 0;
            color: #111827;
          }
          .subtitle {
            text-align: center;
            font-size: 10px;
            color: #6b7280;
            margin-bottom: 10px;
          }
          .summary {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
            margin-bottom: 10px;
          }
          .summary-item {
            background: #f8fafc;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 6px 8px;
            font-size: 10px;
          }
          .summary-item strong {
            color: #2563eb;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
          }
          th {
            background-color: #2563eb;
            color: white;
            padding: 6px 5px;
            text-align: left;
            font-weight: bold;
            font-size: 10px;
            border: 1px solid #dbeafe;
          }
          td {
            padding: 5px;
            border: 1px solid #e5e7eb;
            font-size: 9.5px;
            vertical-align: top;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .stock-cell { font-weight: bold; }
          .name-cell { font-weight: 600; }
          .barcode-cell { font-size: 8.5px; }
          .sizes-cell { font-size: 8.5px; line-height: 1.3; }
        </style>
      </head>
      <body>
        <h1>Öz Spor & Outdoor - Stok Envanteri</h1>
        <div class="subtitle">Tarih: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}</div>

        <div class="summary">
          <div class="summary-item">Toplam Ürün: <strong>${products.length}</strong></div>
          <div class="summary-item">Toplam Kategori: <strong>${new Set(products.map(p => p.category)).size}</strong></div>
          <div class="summary-item">Toplam Stok: <strong>${totalStock} adet</strong></div>
          <div class="summary-item">Potansiyel Ciro: <strong>${totalRevenue.toFixed(2)} TL</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              ${colgroup}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const options = {
      format: 'A4',
      orientation: 'portrait',
      border: {
        top: '6mm',
        right: '6mm',
        bottom: '6mm',
        left: '6mm'
      }
    };

    htmlPdf.create(html, options).toStream((err, stream) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'PDF oluşturma hatası: ' + err.message });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="urunler.pdf"');
      stream.pipe(res);
    });

  } catch (error) {
    console.error('PDF hatası:', error);
    res.status(500).json({ success: false, message: 'PDF oluşturma hatası: ' + error.message });
  }
});

// TOPLU ETİKET PDF
router.get('/api/products/bulk-labels-pdf', async (req, res) => {
  try {
    const { products: productsStr, oldPrice, labelNote, useStockQty } = req.query;

    if (!productsStr) {
      return res.status(400).json({ success: false, message: 'Ürün seçin' });
    }

    const productIds = JSON.parse(decodeURIComponent(productsStr));
    const parsedOldPrice = oldPrice && oldPrice !== '' ? parseFloat(oldPrice) : null;
    const useStock = useStockQty === 'true';

    // Seçili ürünleri getir
    const selectedProducts = await Product.find({ _id: { $in: productIds } });

    if (selectedProducts.length === 0) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    // Etiketleri oluştur
    let labels = [];
    selectedProducts.forEach(product => {
      // Final fiyatı hesapla
      let finalPrice = product.price;
      let discountInfo = '';

      if (product.discountType === 'percentage' && product.discountValue > 0) {
        finalPrice = product.price * (1 - product.discountValue / 100);
        discountInfo = `${product.price.toFixed(2)} TL → ${finalPrice.toFixed(2)} TL (-%${product.discountValue})`;
      } else if (product.discountType === 'fixed' && product.discountValue > 0) {
        finalPrice = Math.max(0, product.price - product.discountValue);
        discountInfo = `${product.price.toFixed(2)} TL → ${finalPrice.toFixed(2)} TL (-${product.discountValue.toFixed(2)} TL)`;
      }

      const sizeStockList = Array.isArray(product.sizeStock) ? product.sizeStock : [];

      if (useStock) {
        sizeStockList.forEach(sizeItem => {
          const stockQty = Number(sizeItem.stock) || 0;
          if (stockQty <= 0) return;

          const sizeLabel = product.category === 'Çocuk Giyim'
            ? sizeItem.size + ' Yaş'
            : sizeItem.size;

          for (let i = 0; i < stockQty; i++) {
            labels.push({
              name: product.name,
              category: product.category,
              sizeLabel: sizeLabel,
              price: product.price,
              finalPrice: finalPrice,
              discountInfo: discountInfo,
              barcode: product.barcode,
              image: product.image,
              labelText: product.labelText || '',
              oldPrice: parsedOldPrice,
              labelNote: labelNote || ''
            });
          }
        });
      } else {
        labels.push({
          name: product.name,
          category: product.category,
          sizeLabel: '',
          price: product.price,
          finalPrice: finalPrice,
          discountInfo: discountInfo,
          barcode: product.barcode,
          image: product.image,
          labelText: product.labelText || '',
          oldPrice: parsedOldPrice,
          labelNote: labelNote || ''
        });
      }
    });

    // HTML oluştur
    let labelHtml = '';
    labels.forEach((label, idx) => {
      let priceHtml = '';
      if (label.oldPrice) {
        priceHtml = `
          <div class="price-section">
            <div class="price-original">
              ${label.oldPrice.toFixed(2)} TL
              <svg viewBox="0 0 100 2" preserveAspectRatio="none">
                <line x1="0" y1="1" x2="100" y2="1" stroke="black" stroke-width="1.5"/>
              </svg>
            </div>
            <div class="price-final">${label.price.toFixed(2)} TL</div>
          </div>
        `;
      } else if (label.discountInfo) {
        priceHtml = `
          <div class="price-section">
            <div class="price-original">
              ${label.price.toFixed(2)} TL
              <svg viewBox="0 0 100 2" preserveAspectRatio="none">
                <line x1="0" y1="1" x2="100" y2="1" stroke="black" stroke-width="1.5"/>
              </svg>
            </div>
            <div class="price-final">${label.finalPrice.toFixed(2)} TL</div>
            <div class="discount-info">${label.discountInfo}</div>
          </div>
        `;
      } else {
        priceHtml = `<div class="price-section"><div class="price-final">${label.price.toFixed(2)} TL</div></div>`;
      }

      let specialText = '';
      if (label.labelText) {
        specialText = `<div class="label-special-text">${label.labelText}</div>`;
      }

      let noteHtml = '';
      if (label.labelNote) {
        noteHtml = `<div class="label-note">${label.labelNote}</div>`;
      } else {
        noteHtml = '<div class="label-note"></div>';
      }

      labelHtml += `
        <div class="label">
          <img src="/images/default-product.png" alt="${label.name}" class="label-image">
          <div class="label-name">${label.name || ''}</div>
          ${label.category ? '<div class="label-category">' + label.category + '</div>' : ''}
          ${label.sizeLabel ? '<div class="label-size-badge">' + label.sizeLabel + '</div>' : ''}
          ${priceHtml}
          <div class="label-barcode-img">
            <svg id="barcode-${idx}"></svg>
          </div>
          <div class="label-barcode-text">${label.barcode || ''}</div>
          ${label.labelText ? '<div class="label-special-text">' + label.labelText + '</div>' : ''}
          ${label.labelNote ? '<div class="label-note">' + label.labelNote + '</div>' : ''}
        </div>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>Toplu Etiketler</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            background: #f5f5f5; 
            padding: 5mm;
            margin: 0;
          }
          .labels-container {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 5mm;
            padding: 5mm;
          }
          .label {
            width: 38mm;
            height: 57mm;
            border: 1px solid #111;
            background: white;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            padding: 1.5mm;
            overflow: hidden;
            page-break-inside: avoid;
            gap: 1mm;
          }
          .label-image {
            width: 100%;
            height: 14mm;
            object-fit: contain;
            border-radius: 1mm;
            background: #fff;
            flex-shrink: 0;
          }
          .label-name {
            font-size: 9pt;
            font-weight: 800;
            text-align: center;
            line-height: 1.1;
            min-height: 8mm;
            max-height: 8mm;
            overflow: hidden;
            word-break: break-word;
            color: #111827;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 1mm;
            flex-shrink: 0;
          }
          .label-category {
            font-size: 7.5pt;
            color: #4b5563;
            text-align: center;
            line-height: 1.1;
            min-height: 3.5mm;
            max-height: 3.5mm;
            overflow: hidden;
            flex-shrink: 0;
          }
          .price-section {
            border-top: 0.5px solid #ddd;
            border-bottom: 0.5px solid #ddd;
            padding: 1.5mm 0;
            position: relative;
          }
          .price-original {
            font-size: 7px;
            color: #999;
            text-decoration: line-through;
            position: relative;
          }
          .price-original svg {
            position: absolute;
            top: 50%;
            left: 0;
            transform: translateY(-50%);
            width: 100%;
            height: 2px;
          }
          .price-final {
            font-size: 12px;
            font-weight: bold;
            color: #2563eb;
          }
          .discount-info {
            font-size: 6px;
            color: #dc2626;
            text-align: center;
            margin-top: 1mm;
          }
          .label-barcode-img {
            width: 100%;
            height: 10mm;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .label-barcode-img svg {
            width: 100%;
            height: 100%;
          }
          .label-barcode-text {
            font-size: 6px;
            text-align: center;
            font-family: 'Courier New', monospace;
            color: #333;
            font-weight: bold;
          }
          .label-special-text {
            font-size: 8px;
            color: #10b981;
            font-weight: bold;
            text-align: center;
            border-top: 0.5px solid #10b981;
            padding-top: 1mm;
          }
          .label-note {
            font-size: 7pt;
            color: #444;
            text-align: center;
            margin-top: auto;
            min-height: 3mm;
            max-height: 6mm;
            overflow: hidden;
            line-height: 1.05;
            word-break: break-word;
            border-top: 1px solid #e5e7eb;
            padding-top: 1mm;
            flex-shrink: 0;
          }
          @media print {
            body { background: white; padding: 0; margin: 0; }
            .labels-container { gap: 0; padding: 0; }
            .label { border: 2px solid #000; }
          }
        </style>
      </head>
      <body>
        <div class="labels-container" id="labels">${labelHtml}</div>
        <script>
          const labels = ${JSON.stringify(labels)};
          
          for (let i = 0; i < labels.length; i++) {
            try {
              JsBarcode('#barcode-' + i, labels[i].barcode, {
                format: 'CODE128',
                width: 1.2,
                height: 24,
                displayValue: false,
                margin: 0
              });
            } catch(e) {
              console.error('Barkod hatasi:', e);
            }
          }

          window.onload = function() {
            setTimeout(() => window.print(), 500);
          };
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Toplu etiket hatası:', error);
    res.status(500).json({ success: false, message: 'Etiket oluşturma hatası: ' + error.message });
  }
});

// Tek etiket PDF
router.get('/api/products/:id/label-pdf', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    const oldPrice = req.query.oldPrice ? parseFloat(req.query.oldPrice) : null;
    const labelNote = req.query.labelNote || '';
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Ürün bulunamadı' });
    }

    // Final fiyatı hesapla
    let finalPrice = product.price;
    let discountInfo = '';

    if (product.discountType === 'percentage' && product.discountValue > 0) {
      finalPrice = product.price * (1 - product.discountValue / 100);
      discountInfo = `${product.price.toFixed(2)} TL → ${finalPrice.toFixed(2)} TL (-%${product.discountValue})`;
    } else if (product.discountType === 'fixed' && product.discountValue > 0) {
      finalPrice = Math.max(0, product.price - product.discountValue);
      discountInfo = `${product.price.toFixed(2)} TL → ${finalPrice.toFixed(2)} TL (-${product.discountValue.toFixed(2)} TL)`;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>${product.name} - Etiket</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            background: #f5f5f5; 
            padding: 5mm;
            margin: 0;
          }
          .labels-container {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 5mm;
            padding: 5mm;
          }
          .label {
            width: 40mm;
            height: 60mm;
            background: white;
            border: 2px solid #000;
            padding: 2.5mm;
            display: flex;
            flex-direction: column;
            gap: 1.5mm;
            box-sizing: border-box;
            page-break-inside: avoid;
            position: relative;
          }
          .label-image {
            width: 100%;
            height: 15mm;
            object-fit: cover;
            border: 0.5px solid #ddd;
            border-radius: 2px;
          }
          .label-name {
            font-size: 9px;
            font-weight: bold;
            color: #333;
            line-height: 1.1;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .label-category {
            font-size: 7px;
            color: #666;
          }
          .price-section {
            border-top: 0.5px solid #ddd;
            border-bottom: 0.5px solid #ddd;
            padding: 1.5mm 0;
            position: relative;
          }
          .price-original {
            font-size: 7px;
            color: #999;
            text-decoration: line-through;
            position: relative;
          }
          .price-original svg {
            position: absolute;
            top: 50%;
            left: 0;
            transform: translateY(-50%);
            width: 100%;
            height: 2px;
          }
          .price-final {
            font-size: 12px;
            font-weight: bold;
            color: #2563eb;
          }
          .discount-info {
            font-size: 6px;
            color: #dc2626;
            text-align: center;
            margin-top: 1mm;
          }
          .label-barcode-img {
            width: 100%;
            height: 10mm;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .label-barcode-img svg {
            width: 100%;
            height: 100%;
          }
          .label-barcode-text {
            font-size: 6px;
            text-align: center;
            font-family: 'Courier New', monospace;
            color: #333;
            font-weight: bold;
          }
          .label-special-text {
            font-size: 8px;
            color: #10b981;
            font-weight: bold;
            text-align: center;
            border-top: 0.5px solid #10b981;
            padding-top: 1mm;
          }
          .label-note {
            font-size: 8px;
            color: #dc2626;
            text-align: center;
            border-top: 0.5px solid #ddd;
            padding-top: 1mm;
            flex-grow: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            line-height: 1.2;
          }
          @media print {
            body { background: white; padding: 0; margin: 0; }
            .labels-container { gap: 0; padding: 0; }
            .label { border: 2px solid #000; }
          }
        </style>
      </head>
      <body>
        <div class="labels-container" id="labels"></div>
        <script>
          const product = {
            name: '${product.name.replace(/'/g, "\\'")}',
            category: '${product.category.replace(/'/g, "\\'")}',
            price: ${product.price},
            finalPrice: ${finalPrice},
            discountInfo: '${discountInfo.replace(/'/g, "\\'")}',
            barcode: '${product.barcode}',
            image: '${product.image}',
            labelText: '${product.labelText ? product.labelText.replace(/'/g, "\\'") : ''}',
            oldPrice: ${oldPrice || 'null'},
            labelNote: '${labelNote.replace(/'/g, "\\'")}'
          };

          function createLabel(index) {
            const label = document.createElement('div');
            label.className = 'label';
            
            let priceHtml = '';
            if (product.oldPrice) {
              priceHtml = \`
                <div class="price-section">
                  <div class="price-original">
                    \${product.oldPrice.toFixed(2)} TL
                    <svg viewBox="0 0 100 2" preserveAspectRatio="none">
                      <line x1="0" y1="1" x2="100" y2="1" stroke="black" stroke-width="1.5"/>
                    </svg>
                  </div>
                  <div class="price-final">\${product.price.toFixed(2)} TL</div>
                </div>
              \`;
            } else if (product.discountInfo) {
              priceHtml = \`
                <div class="price-section">
                  <div class="price-original">
                    \${product.price.toFixed(2)} TL
                    <svg viewBox="0 0 100 2" preserveAspectRatio="none">
                      <line x1="0" y1="1" x2="100" y2="1" stroke="black" stroke-width="1.5"/>
                    </svg>
                  </div>
                  <div class="price-final">\${product.finalPrice.toFixed(2)} TL</div>
                  <div class="discount-info">\${product.discountInfo}</div>
                </div>
              \`;
            } else {
              priceHtml = \`<div class="price-section"><div class="price-final">\${product.price.toFixed(2)} TL</div></div>\`;
            }

            let specialText = '';
            if (product.labelText) {
              specialText = \`<div class="label-special-text">\${product.labelText}</div>\`;
            }

            let noteHtml = '';
            if (product.labelNote) {
              noteHtml = \`<div class="label-note">\${product.labelNote}</div>\`;
            } else {
              noteHtml = '<div class="label-note"></div>';
            }

            label.innerHTML = \`
              <img src="/images/default-product.png" alt="\${product.name}" class="label-image">
              <div class="label-name">\${product.name}</div>
              <div class="label-category">\${product.category}</div>
              \${priceHtml}
              <div class="label-barcode-img">
                <svg id="barcode-\${index}"></svg>
              </div>
              <div class="label-barcode-text">\${product.barcode}</div>
              \${specialText}
              \${noteHtml}
            \`;
            return label;
          }

          const container = document.getElementById('labels');
          
          for (let i = 0; i < 20; i++) {
            const label = createLabel(i);
            container.appendChild(label);
            
            if ((i + 1) % 20 === 0 && i < 99) {
              const pageBreak = document.createElement('div');
              pageBreak.style.pageBreakAfter = 'always';
              container.appendChild(pageBreak);
            }
          }

          for (let i = 0; i < 20; i++) {
            try {
              JsBarcode('#barcode-' + i, product.barcode, {
                format: 'CODE128',
                width: 1.2,
                height: 24,
                displayValue: false,
                margin: 0
              });
            } catch(e) {
              console.error('Barkod hatası:', e);
            }
          }

          window.onload = function() {
            setTimeout(() => window.print(), 500);
          };
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Etiket oluşturma hatası: ' + error.message });
  }
});

// Category & Subcategory APIs
router.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kategoriler yüklenemedi: ' + error.message });
  }
});

router.post('/api/categories', async (req, res) => {
  try {
    const { name, sizes } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Kategori adı zorunludur' });
    }
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/g, '-')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/^-+|-+$/g, '');

    const existing = await Category.findOne({ slug });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Bu kategori zaten mevcut' });
    }

    let sizeList = ['Tek Boyut'];
    if (sizes) {
      sizeList = Array.isArray(sizes) ? sizes : sizes.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    const newCategory = new Category({ name, slug, sizes: sizeList, subcategories: [] });
    await newCategory.save();
    res.status(201).json({ success: true, message: 'Kategori başarıyla oluşturuldu', category: newCategory });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kategori oluşturulamadı: ' + error.message });
  }
});

router.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, sizes } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }

    if (name) {
      category.name = name;
      category.slug = name.toLowerCase()
        .replace(/[^a-z0-9ğüşıöç]+/g, '-')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/^-+|-+$/g, '');
    }

    if (sizes) {
      category.sizes = Array.isArray(sizes) ? sizes : sizes.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    await category.save();
    res.json({ success: true, message: 'Kategori başarıyla güncellendi', category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kategori güncellenemedi: ' + error.message });
  }
});

router.delete('/api/categories/:id', async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }
    res.json({ success: true, message: 'Kategori başarıyla silindi' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kategori silinemedi: ' + error.message });
  }
});

router.post('/api/categories/:id/subcategories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Alt kategori adı zorunludur' });
    }
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }

    const slug = name.toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/g, '-')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/^-+|-+$/g, '');

    const existing = category.subcategories.find(s => s.slug === slug);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Bu alt kategori zaten mevcut' });
    }

    category.subcategories.push({ name, slug });
    await category.save();
    res.status(201).json({ success: true, message: 'Alt kategori başarıyla eklendi', category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Alt kategori eklenemedi: ' + error.message });
  }
});

router.delete('/api/categories/:id/subcategories/:subId', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
    }

    category.subcategories = category.subcategories.filter(s => s._id.toString() !== req.params.subId && s.slug !== req.params.subId);
    await category.save();
    res.json({ success: true, message: 'Alt kategori başarıyla silindi', category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Alt kategori silinemedi: ' + error.message });
  }
});

// Brand APIs
router.get('/api/brands', async (req, res) => {
  try {
    const brands = await Brand.find().sort({ name: 1 });
    res.json(brands);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Markalar yüklenemedi: ' + error.message });
  }
});

router.post('/api/brands', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Marka adı zorunludur' });
    }
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9ğüşıöç]+/g, '-')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/^-+|-+$/g, '');

    const existing = await Brand.findOne({ slug });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Bu marka zaten mevcut' });
    }

    const newBrand = new Brand({ name, slug });
    await newBrand.save();
    res.status(201).json({ success: true, message: 'Marka başarıyla oluşturuldu', brand: newBrand });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Marka oluşturulamadı: ' + error.message });
  }
});

router.delete('/api/brands/:id', async (req, res) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Marka bulunamadı' });
    }
    res.json({ success: true, message: 'Marka başarıyla silindi' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Marka silinemedi: ' + error.message });
  }
});

module.exports = router;
