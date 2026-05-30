const express = require('express');
const router = express.Router();

router.get('/admin/add-product', (req, res) => {
  res.render('admin-add-product', {
    title: 'Ürün Ekle'
  });
});

router.get('/admin/inventory', (req, res) => {
  res.render('admin-inventory', {
    title: 'Stok Listesi'
  });
});

router.get('/admin/sales-history', (req, res) => {
  res.render('sales-history', {
    title: 'Satış Geçmişi'
  });
});

router.get('/pos', (req, res) => {
  res.render('pos-sales', {
    title: 'Hızlı Satış (POS)'
  });
});

router.get('/', (req, res) => {
  res.render('shop-index', {
    title: 'Ana Sayfa'
  });
});

router.get('/products', (req, res) => {
  res.render('shop-products', {
    title: 'Tüm Ürünler'
  });
});

router.get('/admin', (req, res) => {
  res.render('dashboard', {
    title: 'Yönetim Paneli'
  });
});

module.exports = router;
