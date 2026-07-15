const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');

// Middleware to check if user is admin (using the session details from app.js)
function isAdminAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ success: false, message: 'Yetkisiz erişim.' });
}

// POST — Apply coupon (Public API)
router.post('/api/coupons/apply', async (req, res) => {
  try {
    const { code, cartAmount } = req.body;
    if (!code || !cartAmount) {
      return res.status(400).json({ success: false, message: 'Geçersiz parametreler.' });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Böyle bir kupon bulunamadı veya pasif.' });
    }

    const now = new Date();
    if (now < coupon.startDate || now > coupon.endDate) {
      return res.status(400).json({ success: false, message: 'Kuponun geçerlilik süresi dolmuş veya başlamamış.' });
    }

    if (cartAmount < coupon.minOrderAmount) {
      return res.status(400).json({ success: false, message: `Bu kupon en az ${coupon.minOrderAmount.toFixed(2)} ₺ değerindeki siparişlerde geçerlidir.` });
    }

    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (cartAmount * coupon.value) / 100;
    } else {
      discount = coupon.value;
    }

    // Discount cannot exceed cart amount
    if (discount > cartAmount) {
      discount = cartAmount;
    }

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value
      },
      discountAmount: discount
    });

  } catch (err) {
    console.error('Apply coupon error:', err);
    res.status(500).json({ success: false, message: 'Kupon uygulanırken hata oluştu.' });
  }
});

// GET — List all coupons (Admin only)
router.get('/api/admin/coupons', isAdminAuth, async (req, res) => {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Kuponlar yüklenemedi.' });
  }
});

// POST — Add new coupon (Admin only)
router.post('/api/admin/coupons', isAdminAuth, async (req, res) => {
  try {
    const { code, type, value, minOrderAmount, startDate, endDate } = req.body;

    if (!code || !type || value === undefined || !endDate) {
      return res.status(400).json({ success: false, message: 'Lütfen zorunlu alanları doldurun.' });
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Bu kupon kodu zaten mevcut.' });
    }

    const coupon = new Coupon({
      code: code.toUpperCase().trim(),
      type,
      value: parseFloat(value),
      minOrderAmount: parseFloat(minOrderAmount) || 0,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: new Date(endDate)
    });

    await coupon.save();
    res.json({ success: true, coupon, message: 'Kupon başarıyla oluşturuldu.' });

  } catch (err) {
    console.error('Create coupon error:', err);
    res.status(500).json({ success: false, message: 'Kupon oluşturulamadı: ' + err.message });
  }
});

// DELETE — Delete coupon (Admin only)
router.delete('/api/admin/coupons/:id', isAdminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Kupon bulunamadı.' });
    }
    res.json({ success: true, message: 'Kupon başarıyla silindi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Kupon silinemedi.' });
  }
});

module.exports = router;
