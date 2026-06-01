const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true }
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true },
  sizes: { type: [String], default: ['Tek Boyut'] },
  subcategories: [subcategorySchema]
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
