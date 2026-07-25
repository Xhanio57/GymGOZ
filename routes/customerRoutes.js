const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

// Rate limiters for customer-facing auth endpoints
const customerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
  standardHeaders: true,
  legacyHeaders: false
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Çok fazla şifre sıfırlama denemesi. 1 saat sonra tekrar deneyin.',
  standardHeaders: true,
  legacyHeaders: false
});

const resendCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Çok fazla kod gönderme denemesi. 1 saat sonra tekrar deneyin.',
  standardHeaders: true,
  legacyHeaders: false
});

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

// POST — Kayıt işlemi (Doğrulama kodu gönderme adımı)
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

    // Generate a 6-digit random code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in session temporarily
    req.session.tempCustomer = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      password
    };
    req.session.verificationCode = verificationCode;
    req.session.verificationCodeExpires = Date.now() + 10 * 60 * 1000; // 10 dakika

    // Send verification email using Resend API
    const { sendResendEmail } = require('../utils/email');
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #0a0a0a; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 2px;">ÖZ SPOR <span style="color: #d4ff00;">&</span> OUTDOOR</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <h2 style="color: #d4ff00; margin-top: 0;">Üyelik Doğrulama Kodu 🔐</h2>
          <p>Merhaba,</p>
          <p>Öz Spor & Outdoor mağazasına üye olmak üzere talepte bulundunuz. Üyelik işleminizi tamamlamak için aşağıdaki 6 haneli doğrulama kodunu kayıt sayfasındaki alana girmeniz gerekmektedir:</p>
          
          <div style="background-color: #f9f9f9; border: 1px solid #ddd; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0a0a0a;">${verificationCode}</span>
          </div>

          <p style="font-size: 13px; color: #666;">Eğer bu talebi siz gerçekleştirmediyseniz, lütfen bu e-postayı dikkate almayınız.</p>
          <p style="font-size: 12px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px;">
            Bu e-posta otomatik olarak gönderilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    `;

    await sendResendEmail({
      to: email.toLowerCase().trim(),
      subject: 'Öz Spor & Outdoor Üyelik Doğrulama Kodu 🔐',
      html: emailHtml
    });

    return res.render('customer-verify', {
      title: 'E-Posta Doğrulama',
      email: email.toLowerCase().trim(),
      error: null,
      success: 'Doğrulama kodu e-posta adresinize gönderildi. Lütfen gelen kutunuzu (ve gereksiz/spam klasörünü) kontrol edin.',
      redirect
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.render('customer-login', { title: 'Üye Ol', error: 'Kayıt sırasında bir hata oluştu.', success: null, tab: 'register', redirect });
  }
});

// GET — Doğrulama sayfası
router.get('/account/verify', (req, res) => {
  const redirect = req.query.redirect || '';
  const temp = req.session.tempCustomer;
  if (!temp || !req.session.verificationCode) {
    return res.redirect('/account/register');
  }
  res.render('customer-verify', {
    title: 'E-Posta Doğrulama',
    email: temp.email,
    error: null,
    success: null,
    redirect
  });
});

// POST — Doğrulama kodu kontrolü
router.post('/account/verify', async (req, res) => {
  const redirect = req.body.redirect || '';
  const { code } = req.body;
  const temp = req.session.tempCustomer;

  if (!temp || !req.session.verificationCode) {
    return res.redirect('/account/register');
  }

  // Check code expiry
  if (Date.now() > (req.session.verificationCodeExpires || 0)) {
    req.session.verificationCode = null;
    req.session.verificationCodeExpires = null;
    return res.render('customer-verify', {
      title: 'E-Posta Doğrulama',
      email: temp.email,
      error: 'Doğrulama kodunuzun süresi dolmuştur. Lütfen yeni kod isteyin.',
      success: null,
      redirect
    });
  }

  if (!code || code.trim() !== req.session.verificationCode) {
    return res.render('customer-verify', {
      title: 'E-Posta Doğrulama',
      email: temp.email,
      error: 'Girdiğiniz doğrulama kodu geçersiz veya hatalı.',
      success: null,
      redirect
    });
  }

  try {
    const customer = new Customer({
      firstName: temp.firstName,
      lastName: temp.lastName,
      email: temp.email,
      phone: temp.phone,
      password: temp.password
    });
    await customer.save();

    // Clear session values
    req.session.tempCustomer = null;
    req.session.verificationCode = null;

    return res.render('customer-login', {
      title: 'Giriş Yap',
      error: null,
      success: 'E-posta doğrulamanız başarılı! Hesabınız oluşturuldu. Giriş yapabilirsiniz.',
      tab: 'login',
      redirect
    });
  } catch (err) {
    console.error('Verify save error:', err);
    return res.render('customer-verify', {
      title: 'E-Posta Doğrulama',
      email: temp.email,
      error: 'Hesap oluşturulurken bir hata meydana geldi: ' + err.message,
      success: null,
      redirect
    });
  }
});

// POST — Kodu yeniden gönder
router.post('/account/resend-code', resendCodeLimiter, async (req, res) => {
  const redirect = req.body.redirect || '';
  const temp = req.session.tempCustomer;

  if (!temp || !req.session.verificationCode) {
    return res.redirect('/account/register');
  }

  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  req.session.verificationCode = verificationCode;
  req.session.verificationCodeExpires = Date.now() + 10 * 60 * 1000;

  try {
    const { sendResendEmail } = require('../utils/email');
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #0a0a0a; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 2px;">ÖZ SPOR <span style="color: #d4ff00;">&</span> OUTDOOR</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <h2 style="color: #d4ff00; margin-top: 0;">Yeni Üyelik Doğrulama Kodu 🔐</h2>
          <p>Merhaba,</p>
          <p>Talep ettiğiniz yeni 6 haneli doğrulama kodu aşağıdadır:</p>
          
          <div style="background-color: #f9f9f9; border: 1px solid #ddd; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0a0a0a;">${verificationCode}</span>
          </div>

          <p style="font-size: 13px; color: #666;">Eğer bu talebi siz gerçekleştirmediyseniz, lütfen bu e-postayı dikkate almayınız.</p>
        </div>
      </div>
    `;

    await sendResendEmail({
      to: temp.email,
      subject: 'Yeni Üyelik Doğrulama Kodu 🔐',
      html: emailHtml
    });

    return res.render('customer-verify', {
      title: 'E-Posta Doğrulama',
      email: temp.email,
      error: null,
      success: 'Yeni doğrulama kodu e-posta adresinize gönderildi.',
      redirect
    });
  } catch (err) {
    return res.render('customer-verify', {
      title: 'E-Posta Doğrulama',
      email: temp.email,
      error: 'Kod yeniden gönderilirken hata oluştu.',
      success: null,
      redirect
    });
  }
});

// POST — Giriş işlemi (rate limited)
router.post('/account/login', customerLoginLimiter, async (req, res) => {
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

    const customerId = customer._id;
    const customerName = customer.firstName + ' ' + customer.lastName;
    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) return res.redirect('/account/login');
      req.session.customerId = customerId;
      req.session.customerName = customerName;
      req.session.cookie.maxAge = 1000 * 60 * 60 * 3; // 3 saat
      res.redirect(redirect || '/account');
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.render('customer-login', { title: 'Giriş Yap', error: 'Giriş sırasında bir hata oluştu.', success: null, tab: 'login', redirect });
  }
});

// GET — Şifremi Unuttum sayfası
router.get('/account/forgot-password', (req, res) => {
  const redirect = req.query.redirect || '';
  if (req.session && req.session.customerId) return res.redirect(redirect || '/account');
  res.render('customer-login', { title: 'Şifremi Unuttum', error: null, success: null, tab: 'forgot', redirect });
});

// POST — Şifre sıfırlama talebi (rate limited)
router.post('/account/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const redirect = req.body.redirect || '';
  try {
    const { email } = req.body;
    if (!email) {
      return res.render('customer-login', { title: 'Şifremi Unuttum', error: 'Lütfen e-posta adresinizi girin.', success: null, tab: 'forgot', redirect });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase().trim(), isActive: true });
    if (!customer) {
      return res.render('customer-login', { title: 'Şifremi Unuttum', error: 'Bu e-posta adresi ile kayıtlı aktif bir kullanıcı bulunamadı.', success: null, tab: 'forgot', redirect });
    }

    // Generate random crypto token
    const crypto = require('crypto');
    const token = crypto.randomBytes(20).toString('hex');

    // Save token and expiry (1 hour)
    customer.resetPasswordToken = token;
    customer.resetPasswordExpires = Date.now() + 3600000;
    await customer.save();

    // Send email using Resend
    const { sendResendEmail } = require('../utils/email');
    const resetUrl = `${req.protocol}://${req.get('host')}/account/reset-password?token=${token}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #0a0a0a; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 2px;">ÖZ SPOR <span style="color: #d4ff00;">&</span> OUTDOOR</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <h2 style="color: #d4ff00; margin-top: 0;">Şifre Sıfırlama Talebi 🔑</h2>
          <p>Merhaba <strong>${customer.firstName}</strong>,</p>
          <p>Hesabınız için şifre sıfırlama talebinde bulundunuz. Şifrenizi yenilemek için lütfen aşağıdaki butona tıklayın:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #0a0a0a; color: #d4ff00; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; text-transform: uppercase; font-size: 13px; border: 1px solid #222;">Şifremi Sıfırla</a>
          </div>

          <p style="font-size: 12px; color: #666; word-break: break-all;">
            Eğer buton çalışmıyorsa aşağıdaki bağlantıyı tarayıcınıza kopyalayabilirsiniz:<br>
            <a href="${resetUrl}" style="color: #3b82f6;">${resetUrl}</a>
          </p>
          <p style="font-size: 11px; color: #888; margin-top: 20px;">* Bu bağlantı 1 saat boyunca geçerlidir. Talebi siz yapmadıysanız lütfen bu maili dikkate almayınız.</p>
        </div>
      </div>
    `;

    await sendResendEmail({
      to: customer.email,
      subject: 'Öz Spor & Outdoor Şifre Sıfırlama Talebi 🔑',
      html: emailHtml
    });

    return res.render('customer-login', {
      title: 'Şifremi Unuttum',
      error: null,
      success: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi (Lütfen spam klasörünü de kontrol edin).',
      tab: 'forgot',
      redirect
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.render('customer-login', { title: 'Şifremi Unuttum', error: 'Bir hata oluştu. Lütfen tekrar deneyin.', success: null, tab: 'forgot', redirect });
  }
});

// GET — Şifre yenileme sayfası
router.get('/account/reset-password', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.render('customer-login', { title: 'Giriş Yap', error: 'Şifre sıfırlama bağlantısı geçersiz.', success: null, tab: 'login', redirect: '' });
    }

    const customer = await Customer.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
      isActive: true
    });

    if (!customer) {
      return res.render('customer-login', { title: 'Giriş Yap', error: 'Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.', success: null, tab: 'login', redirect: '' });
    }

    res.render('customer-reset-password', {
      title: 'Şifre Yenileme',
      email: customer.email,
      token,
      error: null
    });
  } catch (err) {
    console.error('Reset password get error:', err);
    res.redirect('/account/login');
  }
});

// POST — Şifre yenileme işlemi
router.post('/account/reset-password', async (req, res) => {
  try {
    const { token, password, passwordConfirm } = req.body;
    if (!token || !password || !passwordConfirm) {
      return res.redirect('/account/login');
    }

    const customer = await Customer.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
      isActive: true
    });

    if (!customer) {
      return res.render('customer-login', { title: 'Giriş Yap', error: 'Şifre sıfırlama işlemi başarısız. Süresi dolmuş olabilir.', success: null, tab: 'login', redirect: '' });
    }

    if (password.length < 6) {
      return res.render('customer-reset-password', { title: 'Şifre Yenileme', email: customer.email, token, error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    if (password !== passwordConfirm) {
      return res.render('customer-reset-password', { title: 'Şifre Yenileme', email: customer.email, token, error: 'Şifreler eşleşmiyor.' });
    }

    customer.password = password;
    customer.resetPasswordToken = '';
    customer.resetPasswordExpires = undefined;
    await customer.save();

    return res.render('customer-login', {
      title: 'Giriş Yap',
      error: null,
      success: 'Şifreniz başarıyla güncellendi! Yeni şifrenizle giriş yapabilirsiniz.',
      tab: 'login',
      redirect: ''
    });
  } catch (err) {
    console.error('Reset password post error:', err);
    res.redirect('/account/login');
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

    const orders = await Order.find({ customerEmail: customer.email, paymentStatus: { $ne: 'cancelled' } }).sort({ createdAt: -1 });

    res.render('customer-account', { title: 'Hesabım', customer, orders, success: req.query.success || null, error: req.query.error || null });
  } catch (err) {
    console.error('Account error:', err);
    res.redirect('/account/login');
  }
});

// POST — Profil Bilgilerini Güncelle
router.post('/account/profile', isCustomerAuth, async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/account/login');

    if (firstName && firstName.trim()) customer.firstName = firstName.trim();
    if (lastName && lastName.trim()) customer.lastName = lastName.trim();
    if (phone !== undefined) customer.phone = phone.trim();

    await customer.save();
    req.session.customerName = customer.firstName + ' ' + customer.lastName;

    res.redirect('/account?success=' + encodeURIComponent('Profil bilgileriniz güncellendi.'));
  } catch (err) {
    console.error('Profile update error:', err);
    res.redirect('/account?error=' + encodeURIComponent('Profil güncellenirken hata oluştu.'));
  }
});

// POST — Şifre Değiştirme
router.post('/account/change-password', isCustomerAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.redirect('/account/login');

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      return res.redirect('/account?error=' + encodeURIComponent('Lütfen tüm şifre alanlarını doldurun.'));
    }

    const isMatch = await customer.comparePassword(currentPassword);
    if (!isMatch) {
      return res.redirect('/account?error=' + encodeURIComponent('Mevcut şifreniz hatalı.'));
    }

    if (newPassword.length < 6) {
      return res.redirect('/account?error=' + encodeURIComponent('Yeni şifre en az 6 karakter olmalıdır.'));
    }

    if (newPassword !== newPasswordConfirm) {
      return res.redirect('/account?error=' + encodeURIComponent('Yeni şifreler eşleşmiyor.'));
    }

    customer.password = newPassword;
    await customer.save();

    res.redirect('/account?success=' + encodeURIComponent('Şifreniz başarıyla değiştirildi.'));
  } catch (err) {
    console.error('Change password error:', err);
    res.redirect('/account?error=' + encodeURIComponent('Şifre değiştirilirken hata oluştu.'));
  }
});

// POST — Siparişi iptal et (Sadece ödenmemiş siparişler için)
router.post('/account/orders/:id/cancel', isCustomerAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).send('Sipariş bulunamadı.');
    }

    // Ensure order belongs to logged in customer
    const customer = await Customer.findById(req.session.customerId);
    if (!customer || order.customerEmail.toLowerCase() !== customer.email.toLowerCase()) {
      return res.status(403).send('Bu işlem için yetkiniz yok.');
    }

    // Can cancel if: not paid, OR paid but still in 'preparing' status (not yet shipped)
    const canCancel = order.paymentStatus !== 'paid' ||
      (order.paymentStatus === 'paid' && order.shippingStatus === 'preparing');

    if (!canCancel) {
      return res.status(400).send('Kargoya verilmiş veya teslim edilmiş siparişler iptal edilemez.');
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
  req.session.destroy(err => {
    if (err) console.error('Oturum kapatma hatası:', err);
    res.redirect('/');
  });
});

/* =========================================
   ADMIN CUSTOMER & LOYALTY MANAGEMENT
   ========================================= */

// GET — Admin customer management dashboard view
router.get('/admin/customers', async (req, res) => {
  res.render('admin-customers', { title: 'Müşteriler' });
});

// GET — API route returning all customers with loyalty stats
router.get('/api/admin/customers', async (req, res) => {
  try {
    const customers = await Customer.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    
    const customersWithStats = await Promise.all(customers.map(async (c) => {
      const orders = await Order.find({ customerEmail: c.email });
      const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
      const totalSpent = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      return {
        _id: c._id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt,
        orderCount: paidOrders.length,
        totalSpent: Math.round(totalSpent * 100) / 100
      };
    }));

    res.json(customersWithStats);
  } catch (err) {
    console.error('Fetch admin customers error:', err);
    res.status(500).json({ success: false, message: 'Müşteri istatistikleri yüklenemedi.' });
  }
});

// GET — API route returning details of a single customer
router.get('/api/admin/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });

    const orders = await Order.find({ customerEmail: customer.email }).sort({ createdAt: -1 });
    res.json({ customer, orders });
  } catch (err) {
    console.error('Fetch customer details error:', err);
    res.status(500).json({ success: false, message: 'Müşteri detayları yüklenemedi.' });
  }
});

// DELETE — API route to delete a customer
router.delete('/api/admin/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    res.json({ success: true, message: 'Müşteri başarıyla silindi.' });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ success: false, message: 'Müşteri silinemedi.' });
  }
});

module.exports = router;
