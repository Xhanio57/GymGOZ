const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');
const connectDB = require('./config/database');

async function seed() {
  try {
    // Database'e bağlan
    await connectDB();

    console.log('🧹 Eski ürünler temizleniyor...');
    await Product.deleteMany({});
    console.log('✓ Eski ürünler temizlendi');

    // products.html dosyasını oku
    const productsHtmlPath = path.join(__dirname, 'products.html');
    const htmlContent = fs.readFileSync(productsHtmlPath, 'utf8');

    // const products = [ ... ]; dizisini bul ve ayıkla
    const startMarker = 'const products = [';
    const endMarker = '];';

    const startIndex = htmlContent.indexOf(startMarker);
    if (startIndex === -1) {
      throw new Error('products.html dosyasında "const products = [" başlangıcı bulunamadı.');
    }

    // Başlangıç indeksini ayarla (dizi başlangıç köşeli parantezi dahil)
    const arrayStartIndex = startIndex + 'const products = '.length;

    // Kapanış köşeli parantezini bulalım
    // products dizisinin bittiği yeri güvenli bulabilmek için parantez sayma veya endMarker arama yapabiliriz.
    // products.html içindeki JavaScript'in son kısmındaki ]; işareti products array'inin sonudur.
    const searchArea = htmlContent.substring(arrayStartIndex);
    const endRelativeIndex = searchArea.indexOf(endMarker);
    if (endRelativeIndex === -1) {
      throw new Error('products.html dosyasında "];" kapanışı bulunamadı.');
    }

    const arrayString = searchArea.substring(0, endRelativeIndex + 2).trim();

    // Dizi içeriğini eval yardımıyla JavaScript nesnesi haline getirelim
    // Not: Bu script yerelde bir kere çalışacağı için eval kullanımı güvenlidir.
    const staticProducts = eval(arrayString);
    console.log(`✓ products.html dosyasından ${staticProducts.length} adet statik ürün başarıyla okundu.`);

    const categoryMap = {
      'giyim': 'Spor Giyim',
      'brans': 'Judogi',
      'kamp': 'Kamp Malzemeleri',
      'aksesuar': 'Aksesuarlar'
    };

    const newProducts = staticProducts.map(p => {
      // Kategori eşleştir
      const dbCategory = categoryMap[p.cat] || 'Diğer';

      // Resim yoluna baştan eğik çizgi ekle (statik public klasöründen servis edileceği için)
      let imgPath = p.img;
      if (imgPath && !imgPath.startsWith('/')) {
        imgPath = '/' + imgPath;
      }

      // Beden stoklarını oluştur (Vitrin arayüzünde görünmesi için her bedene varsayılan olarak 10 adet stok tanımlıyoruz)
      const sizeStock = p.sizes.map(size => {
        // 'Tek Boyut' veya normal beden stokları
        return {
          size: size,
          stock: p.stock ? 10 : 0
        };
      });

      return {
        name: p.name,
        price: p.price,
        category: dbCategory,
        subcat: p.subcat || 'aksesuar',
        brand: p.brand || 'Öz Spor',
        image: imgPath || '/images/default-product.png',
        description: p.longDesc || p.desc || '',
        features: Array.isArray(p.features) ? p.features : [],
        sizeStock: sizeStock,
        badge: p.badge || '',
        shopierLink: p.link || 'https://www.shopier.com/oz_spor_outdoor'
      };
    });

    console.log('💾 Ürünler MongoDB\'ye kaydediliyor...');
    const inserted = await Product.insertMany(newProducts);
    console.log(`✓ ${inserted.length} ürün başarıyla veri tabanına eklendi!`);

    process.exit(0);
  } catch (error) {
    console.error('✗ Hata oluştu:', error);
    process.exit(1);
  }
}

seed();
