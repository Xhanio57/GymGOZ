const mongoose = require('mongoose');

const salesHistorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: String,
    size: String,
    quantity: {
      type: Number,
      required: true
    },
    price: Number,
    totalPrice: Number,
    paymentMethod: String,
    cashier: {
      type: String,
      default: 'Sistem'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('SalesHistory', salesHistorySchema);
