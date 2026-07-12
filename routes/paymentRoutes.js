const express = require('express');
const router = express.Router();
const Iyzipay = require('iyzipay');
const Order = require('../models/Order');
const Product = require('../models/Product');

// Initialize iyzico API client
const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY || 'sandbox-e9h5W7v2w7kI7uD8wF5q4g3h9s8f7k6j', // Sandbox Key fallback
  secretKey: process.env.IYZICO_SECRET_KEY || 'sandbox-j6k7s8f9h4g5w6k7I7uD8wF5q4g3h9s8', // Sandbox Secret fallback
  uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
});

// GET route to render checkout page
router.get('/checkout', async (req, res) => {
  res.render('checkout', { title: 'Güvenli Ödeme' });
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

// POST route to initiate iyzico payment form
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

    // Split customer name into Name and Surname
    const nameParts = customerName.trim().split(' ');
    const name = nameParts[0] || 'Müşteri';
    const surname = nameParts.slice(1).join(' ') || 'Müşteri';

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

    // Prepare iyzico checkout form initialize payload
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/checkout/callback`;

    // Map database order items to iyzico basket items
    const basketItems = dbItems.map((item, idx) => {
      return {
        id: item.productId.toString() + '_' + item.size,
        name: item.name + ' (' + item.size + ')',
        category: 'Spor Giyim',
        itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
        price: (item.price * item.quantity).toFixed(2)
      };
    });

    // Obtain client IP address
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: order._id.toString(),
      price: totalAmount.toFixed(2),
      paidPrice: totalAmount.toFixed(2),
      currency: Iyzipay.CURRENCY.TRY,
      basketId: order._id.toString(),
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: callbackUrl,
      enabledInstallments: [1, 2, 3, 6, 9],
      buyer: {
        id: order._id.toString(),
        name: name,
        surname: surname,
        gsmNumber: customerPhone.startsWith('+') ? customerPhone : `+90${customerPhone.replace(/[^0-9]/g, '')}`,
        email: customerEmail,
        identityNumber: '11111111111', // Fake placeholder for sandbox compliance
        lastLoginDate: '2026-01-01 00:00:00',
        registrationDate: '2026-01-01 00:00:00',
        registrationAddress: shippingAddress,
        ip: clientIp,
        city: shippingCity,
        country: 'Turkey',
        zipCode: shippingZip || '34000'
      },
      shippingAddress: {
        contactName: customerName,
        city: shippingCity,
        country: 'Turkey',
        address: shippingAddress,
        zipCode: shippingZip || '34000'
      },
      billingAddress: {
        contactName: customerName,
        city: shippingCity,
        country: 'Turkey',
        address: shippingAddress,
        zipCode: shippingZip || '34000'
      },
      basketItems: basketItems
    };

    // Initialize checkout form
    iyzipay.checkoutFormInitialize.create(request, async function (err, result) {
      if (err || result.status !== 'success') {
        console.error('iyzico Form Initialize Error:', err || result);
        return res.status(500).json({
          success: false,
          message: 'Ödeme arayüzü başlatılamadı: ' + (result ? result.errorMessage : (err ? err.message : 'Bilinmeyen hata'))
        });
      }

      // Save token to the order
      order.paymentToken = result.token;
      await order.save();

      res.json({
        success: true,
        token: result.token,
        checkoutFormContent: result.checkoutFormContent,
        paymentPageUrl: result.paymentPageUrl
      });
    });

  } catch (error) {
    console.error('Checkout initiate error:', error);
    res.status(500).json({ success: false, message: 'İşlem başlatılırken hata oluştu: ' + error.message });
  }
});

// POST callback route called by iyzico checkout form redirect
router.post('/api/checkout/callback', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.redirect('/checkout/error?msg=Ödeme doğrulama tokeni bulunamadı.');
    }

    // Retrieve checkout form payment result
    iyzipay.checkoutForm.retrieve({
      locale: Iyzipay.LOCALE.TR,
      token: token
    }, async function (err, result) {
      if (err || result.status !== 'success') {
        console.error('iyzico Result Retrieval Error:', err || result);
        return res.redirect('/checkout/error?msg=Ödeme sonucu doğrulanamadı.');
      }

      const orderId = result.basketId;
      const order = await Order.findById(orderId);

      if (!order) {
        return res.redirect('/checkout/error?msg=Sipariş kaydı bulunamadı.');
      }

      if (result.paymentStatus === 'SUCCESS') {
        // Payment success
        order.paymentStatus = 'paid';
        order.paymentId = result.paymentId;
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

        // Redirect to success page
        res.redirect(`/checkout/success?id=${order._id}`);
      } else {
        // Payment failure
        order.paymentStatus = 'failed';
        await order.save();
        res.redirect(`/checkout/error?msg=${encodeURIComponent(result.errorMessage || 'Ödeme reddedildi.')}`);
      }
    });

  } catch (error) {
    console.error('Payment callback error:', error);
    res.redirect('/checkout/error?msg=Dönüş işlemi sırasında sunucu hatası oluştu.');
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

module.exports = router;
