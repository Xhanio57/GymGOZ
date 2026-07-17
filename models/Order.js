const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  size: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customerName: {
    type: String,
    required: [true, 'Müşteri adı ve soyadı zorunludur'],
    trim: true
  },
  customerEmail: {
    type: String,
    required: [true, 'E-posta adresi zorunludur'],
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Geçerli bir e-posta adresi girin']
  },
  customerPhone: {
    type: String,
    required: [true, 'Telefon numarası zorunludur'],
    trim: true,
    minlength: [10, 'Telefon numarası en az 10 karakter olmalıdır']
  },
  shippingAddress: {
    type: String,
    required: [true, 'Teslimat adresi zorunludur'],
    trim: true
  },
  shippingCity: {
    type: String,
    required: [true, 'Şehir zorunludur'],
    trim: true
  },
  shippingDistrict: {
    type: String,
    required: [true, 'İlçe zorunludur'],
    trim: true
  },
  shippingZip: {
    type: String,
    trim: true,
    default: ''
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  subtotalAmount: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  vatAmount: {
    type: Number,
    default: 0
  },
  shippingAmount: {
    type: Number,
    default: 0
  },
  couponCode: {
    type: String,
    default: ''
  },
  invoicePdfUrl: {
    type: String,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentToken: {
    type: String,
    default: ''
  },
  paymentId: {
    type: String,
    default: ''
  },
  failedReason: {
    type: String,
    default: ''
  },
  shippingStatus: {
    type: String,
    enum: ['preparing', 'shipped', 'delivered'],
    default: 'preparing'
  },
  cargoProvider: {
    type: String,
    default: ''
  },
  cargoTrackingNo: {
    type: String,
    default: ''
  },
  returnStatus: {
    type: String,
    enum: ['none', 'requested', 'approved', 'rejected'],
    default: 'none'
  },
  returnReason: {
    type: String,
    default: ''
  },
  returnNote: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
