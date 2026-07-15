const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');

// PayTR API yapılandırması
function getPaytrConfig() {
  return {
    merchantId: process.env.PAYTR_MERCHANT_ID || '123456',
    merchantKey: process.env.PAYTR_MERCHANT_KEY || 'xxxxxx',
    merchantSalt: process.env.PAYTR_MERCHANT_SALT || 'yyyyyy'
  };
}

// GET route to render checkout page
router.get('/checkout', async (req, res) => {
  if (!req.session || !req.session.customerId) {
    return res.redirect('/account/login?redirect=checkout');
  }

  try {
    const Customer = require('../models/Customer');
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) {
      req.session.customerId = null;
      req.session.customerName = null;
      return res.redirect('/account/login?redirect=checkout');
    }
    
    res.render('checkout', { 
      title: 'Güvenli Ödeme',
      customer
    });
  } catch (err) {
    console.error('Checkout page load error:', err);
    res.redirect('/');
  }
});

// GET route for retrying payment for an existing failed/pending order
router.get('/checkout/retry/:id', async (req, res) => {
  if (!req.session || !req.session.customerId) {
    return res.redirect('/account/login?redirect=' + encodeURIComponent(req.originalUrl));
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).send('Sipariş bulunamadı.');
    }

    // Ensure order belongs to logged in customer
    const Customer = require('../models/Customer');
    const customer = await Customer.findById(req.session.customerId);
    if (!customer || order.customerEmail.toLowerCase() !== customer.email.toLowerCase()) {
      return res.status(403).send('Bu siparişe erişim yetkiniz yok.');
    }

    if (order.paymentStatus === 'paid') {
      return res.redirect('/account?msg=Siparis zaten odendi.');
    }

    // Generate new PayTR token for this existing order
    const paytrConfig = getPaytrConfig();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const basketData = order.items.map(item => [
      item.name + ' (' + item.size + ')',
      item.price.toFixed(2),
      item.quantity
    ]);
    const user_basket = Buffer.from(JSON.stringify(basketData)).toString('base64');

    const merchant_oid = order._id.toString();
    const payment_amount = Math.round(order.totalAmount * 100);

    const merchant_ok_url = `${req.protocol}://${req.get('host')}/checkout/success?id=${order._id}`;
    const merchant_fail_url = `${req.protocol}://${req.get('host')}/checkout/error?msg=Odeme%20basarisiz.`;

    const email = order.customerEmail;
    const user_name = order.customerName;
    const user_address = order.shippingAddress;
    const user_phone = order.customerPhone;

    const no_installment = 0;
    const max_installment = 0;
    const currency = 'TL';
    const test_mode = process.env.NODE_ENV === 'production' ? '0' : '1';
    const timeout_limit = '30';
    const debug_on = '1';

    const hashStr = paytrConfig.merchantId + clientIp + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode;
    const paytr_token = crypto
      .createHmac('sha256', paytrConfig.merchantKey)
      .update(hashStr + paytrConfig.merchantSalt)
      .digest('base64');

    const paytrPayload = {
      merchant_id: paytrConfig.merchantId,
      user_ip: clientIp,
      merchant_oid,
      email,
      payment_amount,
      paytr_token,
      user_basket,
      merchant_ok_url,
      merchant_fail_url,
      user_name,
      user_address,
      user_phone,
      currency,
      test_mode,
      no_installment,
      max_installment,
      timeout_limit,
      debug_on
    };

    const urlencoded = new URLSearchParams(paytrPayload).toString();

    const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: urlencoded
    });

    const result = await response.json();

    if (result.status === 'success') {
      order.paymentToken = result.token;
      await order.save();

      res.render('checkout-retry', {
        title: 'Yeniden Ödeme Yap',
        order,
        token: result.token
      });
    } else {
      console.error('PayTR Retry Token Request Failed:', result);
      res.status(500).send('Ödeme arayüzü başlatılamadı: ' + (result.err_msg || 'Bilinmeyen hata'));
    }

  } catch (err) {
    console.error('Retry payment error:', err);
    res.status(500).send('Teknik bir hata oluştu: ' + err.message);
  }
});

// GET route for success page
router.get('/checkout/success', async (req, res) => {
  try {
    const orderId = req.query.id;
    if (!orderId) {
      return res.redirect('/');
    }
    const order = await Order.findById(orderId);
    if (!order) {
      return res.redirect('/');
    }
    res.render('checkout-status', {
      title: 'Siparişiniz Alındı',
      status: 'success',
      order
    });
  } catch (err) {
    res.redirect('/');
  }
});

// GET route for error/failure page
router.get('/checkout/error', async (req, res) => {
  const errorMsg = req.query.msg || 'Ödeme işlemi sırasında bir hata oluştu.';
  res.render('checkout-status', {
    title: 'Ödeme Başarısız',
    status: 'error',
    errorMsg
  });
});

// POST route to initiate PayTR payment
router.post('/api/checkout/initiate', async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress,
      shippingCity,
      shippingDistrict,
      shippingZip,
      couponCode,
      items
    } = req.body;

    if (!customerName || !customerEmail || !customerPhone || !shippingAddress || !shippingCity || !shippingDistrict || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Lütfen tüm alanları doldurun ve geçerli sepet ürünleri gönderin' });
    }

    let baseTotal = 0;
    const dbItems = [];

    // Verify stock and calculate total price on the server side
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: `Ürün bulunamadı: ${item.name || item.productId}` });
      }

      // Find stock item for the requested size
      const sizeStockItem = product.sizeStock.find(s => s.size === item.size);
      if (!sizeStockItem) {
        return res.status(400).json({ success: false, message: `Seçilen beden bulunamadı: ${product.name} (${item.size})` });
      }

      if (sizeStockItem.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `Yetersiz stok: ${product.name} (${item.size}) - Kalan: ${sizeStockItem.stock}` });
      }

      // Determine price after discount if any
      const unitPrice = product.finalPrice;
      baseTotal += unitPrice * item.quantity;

      dbItems.push({
        productId: product._id,
        name: product.name,
        size: item.size,
        quantity: item.quantity,
        price: unitPrice
      });
    }

    // Verify and apply coupon code if provided
    let discountAmount = 0;
    let verifiedCouponCode = '';
    if (couponCode) {
      const Coupon = require('../models/Coupon');
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim(), isActive: true });
      if (coupon) {
        const now = new Date();
        if (now >= coupon.startDate && now <= coupon.endDate && baseTotal >= coupon.minOrderAmount) {
          verifiedCouponCode = coupon.code;
          if (coupon.type === 'percentage') {
            discountAmount = (baseTotal * coupon.value) / 100;
          } else {
            discountAmount = coupon.value;
          }
          if (discountAmount > baseTotal) {
            discountAmount = baseTotal;
          }
        }
      }
    }

    const totalAmount = baseTotal - discountAmount;
    const subtotalAmount = totalAmount / 1.2; // 20% VAT
    const vatAmount = totalAmount - subtotalAmount;

    // Create the Order record in database (pending state)
    const order = new Order({
      customerName,
      customerEmail,
      customerPhone,
      shippingAddress,
      shippingCity,
      shippingDistrict,
      shippingZip: shippingZip || '',
      items: dbItems,
      totalAmount,
      subtotalAmount,
      discountAmount,
      vatAmount,
      couponCode: verifiedCouponCode,
      paymentStatus: 'pending'
    });

    await order.save();

    // Send order received (pending payment) email
    const { sendOrderPendingEmail } = require('../utils/email');
    sendOrderPendingEmail(order).catch(err => console.error('E-posta gönderimi başarısız:', err));

    // Prepare PayTR token request
    const paytrConfig = getPaytrConfig();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    // Map database order items to PayTR basket format
    const basketData = dbItems.map(item => [
      item.name + ' (' + item.size + ')',
      item.price.toFixed(2),
      item.quantity
    ]);
    const user_basket = Buffer.from(JSON.stringify(basketData)).toString('base64');

    const merchant_oid = order._id.toString();
    const payment_amount = Math.round(totalAmount * 100); // in kurus

    const merchant_ok_url = `${req.protocol}://${req.get('host')}/checkout/success?id=${order._id}`;
    const merchant_fail_url = `${req.protocol}://${req.get('host')}/checkout/error?msg=Odeme%20basarisiz.`;

    const email = customerEmail;
    const user_name = customerName;
    const user_address = `${shippingAddress} ${shippingDistrict}/${shippingCity}`;
    const user_phone = customerPhone;

    const no_installment = 0; // Allow installments
    const max_installment = 0; // Allow all installments
    const currency = 'TL';
    const test_mode = process.env.NODE_ENV === 'production' ? '0' : '1';
    const timeout_limit = '30';
    const debug_on = '1';

    // Token calculation sequence:
    // merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode + merchant_salt
    const hashStr = paytrConfig.merchantId + clientIp + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode;
    const paytr_token = crypto
      .createHmac('sha256', paytrConfig.merchantKey)
      .update(hashStr + paytrConfig.merchantSalt)
      .digest('base64');

    const paytrPayload = {
      merchant_id: paytrConfig.merchantId,
      user_ip: clientIp,
      merchant_oid,
      email,
      payment_amount,
      paytr_token,
      user_basket,
      merchant_ok_url,
      merchant_fail_url,
      user_name,
      user_address,
      user_phone,
      currency,
      test_mode,
      no_installment,
      max_installment,
      timeout_limit,
      debug_on
    };

    const urlencoded = new URLSearchParams(paytrPayload).toString();

    const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: urlencoded
    });

    const result = await response.json();

    if (result.status === 'success') {
      order.paymentToken = result.token;
      await order.save();

      res.json({
        success: true,
        token: result.token
      });
    } else {
      console.error('PayTR Token Request Failed:', result);

      const reason = result.err_msg || 'Ödeme arayüzü başlatılamadı. Sistem yöneticisi sizinle en kısa sürede iletişime geçecektir.';
      
      order.paymentStatus = 'failed';
      order.failedReason = reason;
      await order.save();

      // Send payment initiation error email & SMS to customer
      const { sendOrderFailureEmail } = require('../utils/email');
      sendOrderFailureEmail(order, reason).catch(err => console.error('E-posta gönderimi başarısız:', err));

      const { sendOrderFailureSMS } = require('../utils/sms');
      sendOrderFailureSMS(order).catch(err => console.error('SMS gönderimi başarısız:', err));

      res.status(500).json({
        success: false,
        orderCreated: true,
        message: 'Ödeme arayüzü başlatılamadı: ' + reason
      });
    }

  } catch (error) {
    console.error('Checkout initiate error:', error);

    const isCreated = !!(order && order._id);
    if (isCreated) {
      const reason = 'Ödeme işlemi başlatılırken teknik bir sorun oluştu. Sistem yöneticisi sizinle en kısa sürede iletişime geçecektir.';
      
      order.paymentStatus = 'failed';
      order.failedReason = error.message || reason;
      await order.save();

      const { sendOrderFailureEmail } = require('../utils/email');
      sendOrderFailureEmail(order, reason).catch(err => console.error('E-posta gönderimi başarısız:', err));

      const { sendOrderFailureSMS } = require('../utils/sms');
      sendOrderFailureSMS(order).catch(err => console.error('SMS gönderimi başarısız:', err));
    }

    res.status(500).json({ 
      success: false, 
      orderCreated: isCreated,
      message: 'İşlem başlatılırken hata oluştu: ' + error.message 
    });
  }
});

// POST callback route called by PayTR server
router.post('/api/checkout/callback', async (req, res) => {
  try {
    const { merchant_oid, status, total_amount, hash } = req.body;

    if (!merchant_oid || !status || !hash) {
      return res.status(400).send('BAD REQUEST');
    }

    const paytrConfig = getPaytrConfig();

    // Hash verification: merchant_oid + merchant_salt + status + total_amount
    const hashStr = merchant_oid + paytrConfig.merchantSalt + status + total_amount;
    const calculatedHash = crypto
      .createHmac('sha256', paytrConfig.merchantKey)
      .update(hashStr)
      .digest('base64');

    if (calculatedHash !== hash) {
      console.error('PayTR Callback Signature Mismatch');
      return res.status(400).send('PAYTR notification failed: bad hash');
    }

    const order = await Order.findById(merchant_oid);
    if (!order) {
      console.error('PayTR Callback: Order not found:', merchant_oid);
      return res.status(404).send('ORDER NOT FOUND');
    }

    if (status === 'success') {
      if (order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.paymentId = req.body.paymentId || 'PAYTR_' + merchant_oid;

        // Generate E-Invoice PDF
        const fs = require('fs');
        const path = require('path');
        const { generateInvoicePDF } = require('../utils/invoice');
        
        const invoicesDir = path.join(__dirname, '../public/invoices');
        if (!fs.existsSync(invoicesDir)) {
          fs.mkdirSync(invoicesDir, { recursive: true });
        }
        
        const pdfPath = path.join(invoicesDir, `fatura_${order._id}.pdf`);
        try {
          await generateInvoicePDF(order, pdfPath);
          order.invoicePdfUrl = `/invoices/fatura_${order._id}.pdf`;
        } catch (pdfErr) {
          console.error('Fatura PDF üretimi sırasında hata oluştu:', pdfErr);
        }

        await order.save();

        // Send order confirmation email & SMS
        const { sendOrderConfirmationEmail } = require('../utils/email');
        sendOrderConfirmationEmail(order).catch(err => console.error('E-posta gönderimi başarısız:', err));

        const { sendOrderConfirmationSMS } = require('../utils/sms');
        sendOrderConfirmationSMS(order).catch(err => console.error('SMS gönderimi başarısız:', err));

        // Update product stock counts
        for (const item of order.items) {
          const product = await Product.findById(item.productId);
          if (product) {
            const sizeStockItem = product.sizeStock.find(s => s.size === item.size);
            if (sizeStockItem) {
              sizeStockItem.stock -= item.quantity;
              // Prevent negative stock
              if (sizeStockItem.stock < 0) {
                sizeStockItem.stock = 0;
              }
              await product.save();
            }
          }
        }
      }
    } else {
      if (order.paymentStatus !== 'failed') {
        const reason = req.body.failed_reason_msg || 'Ödeme sağlayıcı veya banka tarafından işlem reddedildi / bekletiliyor.';
        order.paymentStatus = 'failed';
        order.failedReason = reason;
        await order.save();

        // Send payment failure / on-hold email & SMS
        const { sendOrderFailureEmail } = require('../utils/email');
        sendOrderFailureEmail(order, reason).catch(err => console.error('E-posta gönderimi başarısız:', err));

        const { sendOrderFailureSMS } = require('../utils/sms');
        sendOrderFailureSMS(order).catch(err => console.error('SMS gönderimi başarısız:', err));
      }
    }

    // Always respond with 'OK' as plain text to tell PayTR webhook was successfully processed
    res.send('OK');

  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).send('SERVER ERROR');
  }
});

// GET route to list all orders in Admin Panel
router.get('/admin/orders', async (req, res) => {
  res.render('admin-orders', { title: 'Siparişler' });
});

// GET route to fetch orders JSON for client-side rendering
router.get('/api/admin/orders', async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Siparişler JSON yüklenirken hata:', err);
    res.status(500).json({ success: false, message: 'Siparişler yüklenemedi.' });
  }
});

// POST route to update shipping status & tracking details
router.post('/api/admin/orders/:id/shipping', async (req, res) => {
  try {
    const { id } = req.params;
    const { shippingStatus, cargoProvider, cargoTrackingNo } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Sipariş bulunamadı.' });
    }

    const oldStatus = order.shippingStatus;

    if (shippingStatus) order.shippingStatus = shippingStatus;
    if (cargoProvider !== undefined) order.cargoProvider = cargoProvider;
    if (cargoTrackingNo !== undefined) order.cargoTrackingNo = cargoTrackingNo;

    await order.save();

    // Trigger emails on status changes
    if (shippingStatus === 'shipped' && oldStatus !== 'shipped') {
      const { sendOrderShippedEmail } = require('../utils/email');
      sendOrderShippedEmail(order).catch(err => console.error('Kargo e-postası gönderim hatası:', err));
    } else if (shippingStatus === 'delivered' && oldStatus !== 'delivered') {
      const { sendOrderDeliveredEmail } = require('../utils/email');
      sendOrderDeliveredEmail(order).catch(err => console.error('Teslimat e-postası gönderim hatası:', err));
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Kargo bilgisi güncellenirken hata:', err);
    res.status(500).json({ success: false, message: 'Kargo bilgisi güncellenemedi.' });
  }
});

// POST route to update return status (approved / rejected)
router.post('/api/admin/orders/:id/return', async (req, res) => {
  try {
    const { id } = req.params;
    const { returnStatus } = req.body;

    if (!['approved', 'rejected'].includes(returnStatus)) {
      return res.status(400).json({ success: false, message: 'Geçersiz iade durumu.' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Sipariş bulunamadı.' });
    }

    order.returnStatus = returnStatus;
    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    console.error('İade durumu güncellenirken hata:', err);
    res.status(500).json({ success: false, message: 'İade durumu güncellenemedi.' });
  }
});

// DELETE route to delete an order from database
router.delete('/api/admin/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndDelete(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Sipariş bulunamadı.' });
    }
    res.json({ success: true, message: 'Sipariş başarıyla silindi.' });
  } catch (err) {
    console.error('Sipariş silinirken hata:', err);
    res.status(500).json({ success: false, message: 'Sipariş silinemedi.' });
  }
});

// Diagnostic route to test SMTP email settings
router.get('/api/test-email', async (req, res) => {
  const nodemailer = require('nodemailer');
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: parseInt(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Öz Spor & Outdoor" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: 'GymGOZ E-Posta Testi',
      text: 'E-posta SMTP bağlantısı başarıyla kuruldu!'
    });

    res.json({
      success: true,
      message: 'SMTP Bağlantısı ve E-posta gönderimi başarılı!',
      info
    });
  } catch (err) {
    console.error('Test email error:', err);
    res.json({
      success: false,
      message: 'SMTP E-posta bağlantı hatası oluştu.',
      error: err.message,
      stack: err.stack,
      config: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        from: process.env.SMTP_FROM,
        pass_configured: !!process.env.SMTP_PASS,
        pass_length: process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0
      }
    });
  }
});

// GET - Admin download invoice PDF
router.get('/admin/orders/:id/invoice', async (req, res) => {
  if (!req.session || !req.session.isAdmin) return res.status(401).send('Yetkisiz erişim.');
  try {
    const fs = require('fs');
    const path = require('path');
    const { generateInvoicePDF } = require('../utils/invoice');
    
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Sipariş bulunamadı.');

    const invoicesDir = path.join(__dirname, '../public/invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const pdfPath = path.join(invoicesDir, `fatura_${order._id}.pdf`);
    
    // Generate if not exists
    if (!fs.existsSync(pdfPath)) {
      await generateInvoicePDF(order, pdfPath);
      order.invoicePdfUrl = `/invoices/fatura_${order._id}.pdf`;
      await order.save();
    }

    res.contentType("application/pdf");
    res.download(pdfPath, `fatura_${order._id}.pdf`);
  } catch (err) {
    console.error('Invoice download error:', err);
    res.status(500).send('Fatura dosyası indirilemedi: ' + err.message);
  }
});

// GET - Admin download shipping label A6 PDF
router.get('/admin/orders/:id/shipping-label', async (req, res) => {
  if (!req.session || !req.session.isAdmin) return res.status(401).send('Yetkisiz erişim.');
  try {
    const fs = require('fs');
    const path = require('path');
    const { generateShippingLabelPDF } = require('../utils/shippingLabel');
    
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Sipariş bulunamadı.');

    const labelsDir = path.join(__dirname, '../public/labels');
    if (!fs.existsSync(labelsDir)) {
      fs.mkdirSync(labelsDir, { recursive: true });
    }

    const pdfPath = path.join(labelsDir, `kargo_${order._id}.pdf`);
    
    // Always regenerate to ensure cargo tracking and provider are up to date!
    await generateShippingLabelPDF(order, pdfPath);

    res.contentType("application/pdf");
    res.download(pdfPath, `kargo_${order._id}.pdf`);
  } catch (err) {
    console.error('Shipping label error:', err);
    res.status(500).send('Kargo etiketi indirilemedi: ' + err.message);
  }
});

// GET - Customer download their own invoice PDF
router.get('/account/orders/:id/invoice', async (req, res) => {
  if (!req.session || !req.session.customerId) return res.status(401).send('Giriş yapmanız gerekmektedir.');
  try {
    const fs = require('fs');
    const path = require('path');
    const Customer = require('../models/Customer');
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) return res.status(401).send('Müşteri kaydı bulunamadı.');

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Sipariş bulunamadı.');

    // Security check: order belongs to this customer
    if (order.customerEmail.toLowerCase() !== customer.email.toLowerCase()) {
      return res.status(403).send('Bu işlem için yetkiniz yok.');
    }

    const { generateInvoicePDF } = require('../utils/invoice');
    const invoicesDir = path.join(__dirname, '../public/invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const pdfPath = path.join(invoicesDir, `fatura_${order._id}.pdf`);
    
    // Generate if not exists
    if (!fs.existsSync(pdfPath)) {
      await generateInvoicePDF(order, pdfPath);
      order.invoicePdfUrl = `/invoices/fatura_${order._id}.pdf`;
      await order.save();
    }

    res.contentType("application/pdf");
    res.download(pdfPath, `fatura_${order._id}.pdf`);
  } catch (err) {
    console.error('Customer invoice download error:', err);
    res.status(500).send('Faturanız indirilemedi: ' + err.message);
  }
});

module.exports = router;
