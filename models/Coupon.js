const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Kupon kodu zorunludur'],
    unique: true,
    trim: true,
    uppercase: true
  },
  type: {
    type: String,
    enum: ['percentage', 'flat'],
    required: [true, 'Kupon tipi zorunludur']
  },
  value: {
    type: Number,
    required: [true, 'İndirim değeri zorunludur'],
    min: [0, 'İndirim değeri negatif olamaz']
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: [0, 'Minimum sepet tutarı negatif olamaz']
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: [true, 'Bitiş tarihi zorunludur']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Coupon', couponSchema);
