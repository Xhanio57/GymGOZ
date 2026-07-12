const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  title: { type: String, default: 'Ev' },
  fullAddress: { type: String, default: '' },
  city: { type: String, default: '' },
  district: { type: String, default: '' },
  zipCode: { type: String, default: '' }
}, { _id: true });

const customerSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Ad zorunludur'],
    trim: true,
    maxlength: [50, 'Ad 50 karakteri geçemez']
  },
  lastName: {
    type: String,
    required: [true, 'Soyad zorunludur'],
    trim: true,
    maxlength: [50, 'Soyad 50 karakteri geçemez']
  },
  email: {
    type: String,
    required: [true, 'E-posta zorunludur'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Geçerli bir e-posta adresi girin']
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  password: {
    type: String,
    required: [true, 'Şifre zorunludur'],
    minlength: [6, 'Şifre en az 6 karakter olmalıdır']
  },
  addresses: [addressSchema],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before save
customerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
customerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Customer', customerSchema);
