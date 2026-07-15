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
      items
    } = req.body;

    if (!customerName || !customerEmail || !customerPhone || !shippingAddress || !shippingCity || !shippingDistrict || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Lütfen tüm alanları doldurun ve geçerli sepet ürünleri gönderin' });
    }

    let totalAmount = 0;
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
      totalAmount += unitPrice * item.quantity;

      dbItems.push({
        productId: product._id,
        name: product.name,
        size: item.size,
        quantity: item.quantity,
        price: unitPrice
      });
    }

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
      paymentStatus: 'pending'
    });

    await order.save();

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
      res.status(500).json({
        success: false,
        message: 'Ödeme arayüzü başlatılamadı: ' + (result.err_msg || 'Bilinmeyen hata')
      });
    }

  } catch (error) {
    console.error('Checkout initiate error:', error);
    res.status(500).json({ success: false, message: 'İşlem başlatılırken hata oluştu: ' + error.message });
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
        await order.save();

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
      order.paymentStatus = 'failed';
      await order.save();
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

    if (shippingStatus) order.shippingStatus = shippingStatus;
    if (cargoProvider !== undefined) order.cargoProvider = cargoProvider;
    if (cargoTrackingNo !== undefined) order.cargoTrackingNo = cargoTrackingNo;

    await order.save();
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

module.exports = router;
