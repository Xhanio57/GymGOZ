const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const SalesHistory = require('../models/SalesHistory');

router.post('/api/sales', async (req, res) => {
  try {
    const { productId, size, quantity, paymentMethod, cashier } = req.body;

    if (!productId || !size || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Ürün, beden ve miktar zorunludur'
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Ürün bulunamadı'
      });
    }

    const sizeItem = product.sizeStock.find(s => s.size === size);

    if (!sizeItem) {
      return res.status(404).json({
        success: false,
        message: 'Beden bulunamadı'
      });
    }

    if (sizeItem.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Yeterli stok yok. Mevcut: ${sizeItem.stock}`
      });
    }

    sizeItem.stock -= parseInt(quantity);
    await product.save();

    const sale = new SalesHistory({
      productId: productId,
      productName: product.name,
      size: size,
      quantity: parseInt(quantity),
      price: product.finalPrice,
      totalPrice: product.finalPrice * quantity,
      paymentMethod: paymentMethod || 'Nakit',
      cashier: cashier || 'Sistem'
    });

    await sale.save();

    res.json({
      success: true,
      message: `Satış başarılı. ${product.name} (${size}) x${quantity}`,
      product,
      totalPrice: product.finalPrice * quantity
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Satış hatası: ' + error.message
    });
  }
});

router.get('/api/sales-history', async (req, res) => {
  try {
    const history = await SalesHistory.find()
      .sort({ createdAt: -1 })
      .limit(500);
    res.json(history);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Geçmiş yüklenemedi: ' + error.message
    });
  }
});

router.get('/api/sales-history/date/:startDate/:endDate', async (req, res) => {
  try {
    const start = new Date(req.params.startDate);
    const end = new Date(req.params.endDate);
    end.setHours(23, 59, 59, 999);

    const history = await SalesHistory.find({
      createdAt: { $gte: start, $lte: end }
    }).sort({ createdAt: -1 });

    res.json(history);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Geçmiş yüklenemedi: ' + error.message
    });
  }
});

// Satış geçmişini sil
router.delete('/api/sales-history/:id', async (req, res) => {
  try {
    const restoreStock = req.query.restore === 'true';
    
    const sale = await SalesHistory.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Satış kaydı bulunamadı'
      });
    }

    // Eğer stok geri eklenecekse
    if (restoreStock) {
      const product = await Product.findById(sale.productId);

      if (product) {
        const sizeItem = product.sizeStock.find(s => s.size === sale.size);
        if (sizeItem) {
          sizeItem.stock += sale.quantity;
          await product.save();
        }
      }
    }

    // Satış kaydını sil
    await SalesHistory.findByIdAndDelete(req.params.id);

    const msg = restoreStock 
      ? `Satış silindi. ${sale.productName} (${sale.size}) x${sale.quantity} stoka geri eklendi`
      : `Satış silindi. Stok değişmedi`;

    res.json({
      success: true,
      message: msg
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Silme hatası: ' + error.message
    });
  }
});

module.exports = router;
