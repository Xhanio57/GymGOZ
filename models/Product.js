const mongoose = require('mongoose');

const generateUniqueBarcode = async () => {
  let barcode;
  let isUnique = false;
  
  while (!isUnique) {
    barcode = Math.floor(10000000 + Math.random() * 90000000).toString();
    const existingProduct = await mongoose.model('Product').findOne({ barcode });
    isUnique = !existingProduct;
  }
  
  return barcode;
};

const sizeStockSchema = new mongoose.Schema({
  size: String,
  stock: { type: Number, default: 0, min: 0 }
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Ürün adı zorunludur'],
      trim: true,
      maxlength: [100, 'Ürün adı 100 karakteri geçemez']
    },
    barcode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    price: {
      type: Number,
      required: [true, 'Fiyat zorunludur'],
      min: [0, 'Fiyat negatif olamaz']
    },
    discountType: {
      type: String,
      enum: ['none', 'percentage', 'fixed'],
      default: 'none'
    },
    discountValue: {
      type: Number,
      default: 0
    },
    discountLabel: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      required: [true, 'Kategori zorunludur'],
      default: 'Diğer'
    },
    sizeStock: [sizeStockSchema],
    image: {
      type: String,
      default: '/images/default-product.png'
    },
    description: {
      type: String,
      default: ''
    },
    labelText: {
      type: String,
      default: ''
    },
    brand: {
      type: String,
      default: 'Öz Spor'
    },
    shopierLink: {
      type: String,
      default: ''
    },
    features: {
      type: [String],
      default: []
    },
    subcat: {
      type: String,
      default: ''
    },
    badge: {
      type: String,
      default: ''
    },
    views: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

productSchema.pre('save', async function (next) {
  if (!this.barcode) {
    this.barcode = await generateUniqueBarcode();
  }

  // Automatic brand stripping and suffix abbreviation formatting
  if (this.name) {
    const brandAbbreviations = {
      'Nike': 'NKE',
      'Adidas': 'ADS',
      'Puma': 'PMA',
      'Reebok': 'RBK',
      'Hummel': 'HML',
      'Under Armour': 'UA',
      'Decathlon': 'DEC',
      'Öz Spor': 'ÖZS',
      'Dragon-Do': 'DRG',
      'İppon Gear': 'IPG',
      'Oysho': 'OYS',
      'Miu Miu': 'MIU'
    };

    const sortedBrandNames = Object.keys(brandAbbreviations).sort((a, b) => b.length - a.length);
    let matchedBrand = null;

    for (const brandName of sortedBrandNames) {
      const escapedBrand = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('(?:^|\\s|[-–—/])' + escapedBrand + '(?:$|\\s|[-–—/])', 'gi');
      if (regex.test(this.name)) {
        matchedBrand = brandName;
        break;
      }
    }

    if (matchedBrand) {
      const abbr = brandAbbreviations[matchedBrand];
      const suffix = ` (${abbr})`;
      const escapedBrand = matchedBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('(?:^|\\s|[-–—/])' + escapedBrand + '(?:$|\\s|[-–—/])', 'gi');
      
      let cleanedName = this.name.replace(regex, ' ').replace(/\s+/g, ' ').trim();
      cleanedName = cleanedName.replace(/^[-–—\s]+|[-–—\s]+$/g, '');

      if (!cleanedName.endsWith(suffix)) {
        this.name = cleanedName + suffix;
      } else {
        this.name = cleanedName;
      }
      this.brand = matchedBrand;
    }
  }
  
  if (!this.sizeStock || this.sizeStock.length === 0) {
    const sizes = {
      'Judogi': Array.from({length: 11}, (_, i) => (100 + i * 10).toString() + 'cm'),
      'Ayakkabı': Array.from({length: 11}, (_, i) => (36 + i).toString()),
      'Spor Giyim': ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL'],
      'Çocuk Giyim': Array.from({length: 18}, (_, i) => (i + 1).toString() + ' Yaş'),
      'Kamp Malzemeleri': ['Tek Boyut'],
      'Aksesuarlar': ['Tek Boyut'],
      'Diğer': ['Tek Boyut']
    };
    
    this.sizeStock = (sizes[this.category] || ['Tek Boyut']).map(size => ({
      size,
      stock: 0
    }));
  }
  
  next();
});

productSchema.virtual('totalStock').get(function() {
  return this.sizeStock.reduce((total, item) => total + item.stock, 0);
});

productSchema.virtual('finalPrice').get(function() {
  if (this.discountType === 'none') return this.price;
  if (this.discountType === 'percentage') {
    return this.price * (1 - this.discountValue / 100);
  }
  if (this.discountType === 'fixed') {
    return Math.max(0, this.price - this.discountValue);
  }
  return this.price;
});

module.exports = mongoose.model('Product', productSchema);
