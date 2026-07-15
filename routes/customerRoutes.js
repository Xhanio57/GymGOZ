const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

// Middleware: müşteri oturumu kontrolü
function isCustomerAuth(req, res, next) {
  if (req.session && req.session.customerId) return next();
  return res.redirect('/account/login');
}

// GET — Giriş sayfası
router.get('/account/login', (req, res) => {
  const redirect = req.query.redirect || '';
  if (req.session && req.session.customerId) return res.redirect(redirect || '/account');
  res.render('customer-login', { title: 'Giriş Yap', error: null, success: null, tab: 'login', redirect });
});

// GET — Kayıt sayfası
router.get('/account/register', (req, res) => {
  const redirect = req.query.redirect || '';
  if (req.session && req.session.customerId) return res.redirect(redirect || '/account');
  res.render('customer-login', { title: 'Üye Ol', error: null, success: null, tab: 'register', redirect });
});

// POST — Kayıt işlemi
router.post('/account/register', async (req, res) => {
  const redirect = req.body.redirect || '';
  try {
    const { firstName, lastName, email, phone, password, passwordConfirm } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.render('customer-login', { title: 'Üye Ol', error: 'Tüm zorunlu alanları doldurun.', success: null, tab: 'register', redirect });
    }
    if (password.length < 6) {
      return res.render('customer-login', { title: 'Üye Ol', error: 'Şifre en az 6 karakter olmalıdır.', success: null, tab: 'register', redirect });
    }
    if (password !== passwordConfirm) {
      return res.render('customer-login', { title: 'Üye Ol', error: 'Şifreler eşleşmiyor.', success: null, tab: 'register', redirect });
    }

    const existing = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.render('customer-login', { title: 'Üye Ol', error: 'Bu e-posta adresi zaten kayıtlı.', success: null, tab: 'register', redirect });
    }

    const customer = new Customer({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      password
    });
    await customer.save();

    return res.render('customer-login', {
      title: 'Giriş Yap',
      error: null,
      success: 'Hesabınız oluşturuldu! Şimdi giriş yapabilirsiniz.',
      tab: 'login',
      redirect
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.render('customer-login', { title: 'Üye Ol', error: 'Kayıt sırasında bir hata oluştu.', success: null, tab: 'register', redirect });
  }
});

// POST — Giriş işlemi
router.post('/account/login', async (req, res) => {
  const redirect = req.body.redirect || '';
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('customer-login', { title: 'Giriş Yap', error: 'E-posta ve şifre gerekli.', success: null, tab: 'login', redirect });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase().trim(), isActive: true });
    if (!customer) {
      return res.render('customer-login', { title: 'Giriş Yap', error: 'E-posta veya şifre hatalı.', success: null, tab: 'login', redirect });
    }

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) {
      return res.render('customer-login', { title: 'Giriş Yap', error: 'E-posta veya şifre hatalı.', success: null, tab: 'login', redirect });
    }

    req.session.customerId = customer._id;
    req.session.customerName = customer.firstName + ' ' + customer.lastName;
    return res.redirect(redirect || '/account');
  } catch (err) {
    console.error('Login error:', err);
    return res.render('customer-login', { title: 'Giriş Yap', error: 'Giriş sırasında bir hata oluştu.', success: null, tab: 'login', redirect });
  }
});

// POST — Adres Ekleme
router.post('/account/address', isCustomerAuth, async (req, res) => {
  try {
    const { title, fullAddress, city, district, zipCode } = req.body;
    if (!fullAddress || !city || !district) {
      return res.redirect('/account');
    }

    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/account/login');

    customer.addresses.push({
      title: title || 'Ev',
      fullAddress,
      city,
      district,
      zipCode: zipCode || ''
    });

    await customer.save();
    res.redirect('/account');
  } catch (err) {
    console.error('Add address error:', err);
    res.redirect('/account');
  }
});

// POST — Adres Silme
router.post('/account/address/:index/delete', isCustomerAuth, async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/account/login');

    if (index >= 0 && index < customer.addresses.length) {
      customer.addresses.splice(index, 1);
      await customer.save();
    }

    res.redirect('/account');
  } catch (err) {
    console.error('Delete address error:', err);
    res.redirect('/account');
  }
});

// GET — Hesabım paneli
router.get('/account', isCustomerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) {
      req.session.customerId = null;
      req.session.customerName = null;
      return res.redirect('/account/login');
    }

    const Order = require('../models/Order');
    const orders = await Order.find({ customerEmail: customer.email, paymentStatus: { $ne: 'cancelled' } }).sort({ createdAt: -1 });

    res.render('customer-account', { title: 'Hesabım', customer, orders });
  } catch (err) {
    console.error('Account error:', err);
    res.redirect('/account/login');
  }
});

// POST — Siparişi iptal et (Sadece ödenmemiş siparişler için)
router.post('/account/orders/:id/cancel', isCustomerAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const Order = require('../models/Order');
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).send('Sipariş bulunamadı.');
    }

    // Ensure order belongs to logged in customer
    const customer = await Customer.findById(req.session.customerId);
    if (!customer || order.customerEmail.toLowerCase() !== customer.email.toLowerCase()) {
      return res.status(403).send('Bu işlem için yetkiniz yok.');
    }

    // Only allowed if NOT paid
    if (order.paymentStatus === 'paid') {
      return res.status(400).send('Ödenmiş siparişler iptal edilemez.');
    }

    // Set status to cancelled and save the order (do not delete so admin can see it)
    order.paymentStatus = 'cancelled';
    order.failedReason = 'Müşteri tarafından iptal edildi.';
    await order.save();

    res.redirect('/account');
  } catch (err) {
    console.error('Cancel order error:', err);
    res.redirect('/account');
  }
});

// GET — İade Talebi Sayfası
router.get('/account/orders/:id/return', isCustomerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/account/login');

    const Order = require('../models/Order');
    const order = await Order.findById(req.params.id);
    
    if (!order || order.customerEmail !== customer.email || order.paymentStatus !== 'paid' || order.returnStatus !== 'none') {
      return res.redirect('/account');
    }

    res.render('customer-return', { title: 'İade Talebi Oluştur', customer, order, error: null });
  } catch (err) {
    console.error('Order return view error:', err);
    res.redirect('/account');
  }
});

// POST — İade Talebi Gönderme
router.post('/account/orders/:id/return', isCustomerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/account/login');

    const Order = require('../models/Order');
    const order = await Order.findById(req.params.id);

    if (!order || order.customerEmail !== customer.email || order.paymentStatus !== 'paid' || order.returnStatus !== 'none') {
      return res.redirect('/account');
    }

    const { reason, note } = req.body;
    if (!reason) {
      return res.render('customer-return', { 
        title: 'İade Talebi Oluştur', 
        customer, 
        order, 
        error: 'Lütfen bir iade nedeni seçin.' 
      });
    }

    order.returnStatus = 'requested';
    order.returnReason = reason;
    order.returnNote = note || '';
    await order.save();

    res.redirect('/account');
  } catch (err) {
    console.error('Submit return error:', err);
    res.redirect('/account');
  }
});

// GET — Çıkış
router.get('/account/logout', (req, res) => {
  req.session.customerId = null;
  req.session.customerName = null;
  res.redirect('/');
});

module.exports = router;
