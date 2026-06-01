const Category = require('../models/Category');
const Brand = require('../models/Brand');

async function seedData() {
  try {
    const categoryCount = await Category.countDocuments();
    if (categoryCount === 0) {
      console.log('🌱 Kategoriler tohumlanıyor...');
      const defaultCategories = [
        {
          name: 'Spor Giyim',
          slug: 'spor-giyim',
          sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL'],
          subcategories: [
            { name: 'Mont & Yağmurluk', slug: 'mont' },
            { name: 'T-Shirt', slug: 'tshirt' },
            { name: 'Alt Giyim', slug: 'alt' }
          ]
        },
        {
          name: 'Çocuk Giyim',
          slug: 'cocuk-giyim',
          sizes: Array.from({ length: 18 }, (_, i) => `${i + 1} Yaş`),
          subcategories: [
            { name: 'Mont & Yağmurluk', slug: 'mont' },
            { name: 'T-Shirt', slug: 'tshirt' },
            { name: 'Alt Giyim', slug: 'alt' }
          ]
        },
        {
          name: 'Judogi',
          slug: 'judogi',
          sizes: Array.from({ length: 11 }, (_, i) => `${100 + i * 10}cm`),
          subcategories: [
            { name: 'Judo', slug: 'judo' },
            { name: 'Güreş', slug: 'gures' },
            { name: 'Boks', slug: 'boks' }
          ]
        },
        {
          name: 'Kamp Malzemeleri',
          slug: 'kamp-malzemeleri',
          sizes: ['Tek Boyut'],
          subcategories: [
            { name: 'Mat & Çadır', slug: 'mat' },
            { name: 'Aydınlatma', slug: 'aydinlatma' }
          ]
        },
        {
          name: 'Ayakkabı',
          slug: 'ayakkabi',
          sizes: Array.from({ length: 27 }, (_, i) => `${20 + i}`),
          subcategories: []
        },
        {
          name: 'Aksesuarlar',
          slug: 'aksesuarlar',
          sizes: ['Tek Boyut'],
          subcategories: [
            { name: 'Aksesuar', slug: 'aksesuar' }
          ]
        },
        {
          name: 'Diğer',
          slug: 'diger',
          sizes: ['Tek Boyut'],
          subcategories: []
        }
      ];
      await Category.insertMany(defaultCategories);
      console.log('✓ Kategoriler başarıyla tohumlandı');
    }

    const brandCount = await Brand.countDocuments();
    if (brandCount === 0) {
      console.log('🌱 Markalar tohumlanıyor...');
      const defaultBrands = [
        { name: 'Öz Spor', slug: 'oz-spor' },
        { name: 'Adidas', slug: 'adidas' },
        { name: 'Nike', slug: 'nike' },
        { name: 'Puma', slug: 'puma' },
        { name: 'Reebok', slug: 'reebok' },
        { name: 'Hummel', slug: 'hummel' },
        { name: 'Under Armour', slug: 'under-armour' },
        { name: 'Decathlon', slug: 'decathlon' }
      ];
      await Brand.insertMany(defaultBrands);
      console.log('✓ Markalar başarıyla tohumlandı');
    }
  } catch (error) {
    console.error('✗ Tohumlama hatası:', error);
  }
}

module.exports = seedData;
