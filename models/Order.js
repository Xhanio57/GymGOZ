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
    trim: true
  },
  customerPhone: {
    type: String,
    required: [true, 'Telefon numarası zorunludur'],
    trim: true
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
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
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
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
