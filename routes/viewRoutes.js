const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const SalesHistory = require('../models/SalesHistory');
const Order = require('../models/Order');

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

router.get('/admin', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // POS sales (SalesHistory)
    const [todaySales, weekSales, monthSales, yearSales, allSales] = await Promise.all([
      SalesHistory.find({ createdAt: { $gte: todayStart } }),
      SalesHistory.find({ createdAt: { $gte: weekStart } }),
      SalesHistory.find({ createdAt: { $gte: monthStart } }),
      SalesHistory.find({ createdAt: { $gte: yearStart } }),
      SalesHistory.find({})
    ]);

    // Online orders (only paid)
    const [todayOrders, weekOrders, monthOrders, yearOrders, allOrders] = await Promise.all([
      Order.find({ createdAt: { $gte: todayStart }, paymentStatus: 'paid' }),
      Order.find({ createdAt: { $gte: weekStart }, paymentStatus: 'paid' }),
      Order.find({ createdAt: { $gte: monthStart }, paymentStatus: 'paid' }),
      Order.find({ createdAt: { $gte: yearStart }, paymentStatus: 'paid' }),
      Order.find({ paymentStatus: 'paid' })
    ]);

    const calcRevenue = (salesArr, ordersArr) => {
      const salesTotal = salesArr.reduce((s, x) => s + (x.totalPrice || 0), 0);
      const ordersTotal = ordersArr.reduce((s, x) => s + (x.totalAmount || 0), 0);
      return salesTotal + ordersTotal;
    };

    const calcItems = (salesArr) => salesArr.reduce((s, x) => s + (x.quantity || 1), 0);

    // Get products for profit calc (we need costPrice)
    const products = await Product.find({}, 'name costPrice price sizeStock').lean();
    const productCostMap = {};
    products.forEach(p => { productCostMap[p._id.toString()] = p.costPrice || p.price * 0.5; });
    const totalProducts = products.length;
    const totalStock = products.reduce((s, p) => s + (p.sizeStock || []).reduce((ss, sv) => ss + sv.stock, 0), 0);

    const calcProfit = (salesArr) => {
      return salesArr.reduce((s, x) => {
        const cost = productCostMap[x.productId ? x.productId.toString() : ''] || (x.price || 0) * 0.5;
        return s + ((x.totalPrice || 0) - cost * (x.quantity || 1));
      }, 0);
    };

    // Build last 7 days chart data for POS sales
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(d.getDate() + 1);
      const daySales = await SalesHistory.find({ createdAt: { $gte: d, $lt: nextD } });
      const dayOrders = await Order.find({ createdAt: { $gte: d, $lt: nextD }, paymentStatus: 'paid' });
      last7Days.push({
        label: d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'numeric' }),
        revenue: calcRevenue(daySales, dayOrders)
      });
    }

    // Build last 12 months
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const mSales = await SalesHistory.find({ createdAt: { $gte: mStart, $lt: mEnd } });
      const mOrders = await Order.find({ createdAt: { $gte: mStart, $lt: mEnd }, paymentStatus: 'paid' });
      last12Months.push({
        label: mStart.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }),
        revenue: calcRevenue(mSales, mOrders)
      });
    }

    const stats = {
      today: { revenue: calcRevenue(todaySales, todayOrders), items: calcItems(todaySales), orders: todayOrders.length, profit: calcProfit(todaySales) },
      week: { revenue: calcRevenue(weekSales, weekOrders), items: calcItems(weekSales), orders: weekOrders.length, profit: calcProfit(weekSales) },
      month: { revenue: calcRevenue(monthSales, monthOrders), items: calcItems(monthSales), orders: monthOrders.length, profit: calcProfit(monthSales) },
      year: { revenue: calcRevenue(yearSales, yearOrders), items: calcItems(yearSales), orders: yearOrders.length, profit: calcProfit(yearSales) },
      all: { revenue: calcRevenue(allSales, allOrders), items: calcItems(allSales), orders: allOrders.length, profit: calcProfit(allSales) },
      totalProducts,
      totalStock,
      chartDaily: JSON.stringify(last7Days),
      chartMonthly: JSON.stringify(last12Months)
    };

    res.render('dashboard', { title: 'Yönetim Paneli', stats });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('dashboard', { title: 'Yönetim Paneli', stats: null, error: err.message });
  }
});

router.get('/admin/stock-count', async (req, res) => {
  try {
    const products = await Product.find({}).sort({ name: 1 }).lean();
    res.render('admin-stock-count', { title: 'Stok Sayımı', products });
  } catch (err) {
    res.status(500).send('Stok sayımı yüklenemedi: ' + err.message);
  }
});

router.get('/admin/settings', (req, res) => {
  res.render('admin-settings', {
    title: 'Ayarlar'
  });
});

// Yasal Sayfalar
router.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Gizlilik Politikası' });
});

router.get('/terms', (req, res) => {
  res.render('terms', { title: 'Kullanım Koşulları' });
});

router.get('/refund-policy', (req, res) => {
  res.render('refund-policy', { title: 'İade ve İptal Politikası' });
});

router.get('/kvkk', (req, res) => {
  res.render('kvkk', { title: 'KVKK Aydınlatma Metni' });
});

module.exports = router;
