const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Helper to convert numbers to Turkish currency string
 */
function numberToWords(number) {
  const units = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"];
  const tens = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Atmış", "Yetmiş", "Seksen", "Doksan"];
  
  let integerPart = Math.floor(number);
  let decimalPart = Math.round((number - integerPart) * 100);

  function convertPart(n) {
    let str = "";
    let h = Math.floor(n / 100);
    let t = Math.floor((n % 100) / 10);
    let u = n % 10;

    if (h > 0) {
      str += (h === 1 ? "" : units[h]) + "Yüz";
    }
    str += tens[t] + units[u];
    return str;
  }

  let words = "";
  if (integerPart === 0) {
    words += "Sıfır";
  } else {
    // Handling up to millions for standard e-commerce orders
    let millions = Math.floor(integerPart / 1000000);
    let thousands = Math.floor((integerPart % 1000000) / 1000);
    let hundreds = integerPart % 1000;

    if (millions > 0) {
      words += convertPart(millions) + "Milyon";
    }
    if (thousands > 0) {
      words += (thousands === 1 ? "" : convertPart(thousands)) + "Bin";
    }
    if (hundreds > 0) {
      words += convertPart(hundreds);
    }
  }

  words += " TürkLirası";

  if (decimalPart > 0) {
    words += " " + convertPart(decimalPart) + " Kuruş";
  }

  return words;
}

/**
 * Generate invoice PDF and save to disk
 */
function generateInvoicePDF(order, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Register Turkish fonts
    const regularFont = path.join(__dirname, '../public/fonts/Roboto-Regular.ttf');
    const boldFont = path.join(__dirname, '../public/fonts/Roboto-Medium.ttf');
    doc.registerFont('CustomRegular', regularFont);
    doc.registerFont('CustomBold', boldFont);

    doc.font('CustomRegular');

    // --- Header Banner ---
    doc.rect(40, 40, 515, 60).fill('#141418');
    
    // Logo text
    doc.fillColor('#d4ff00').font('CustomBold').fontSize(16).text('ÖZ SPOR & OUTDOOR', 55, 52);
    doc.fillColor('#888884').font('CustomRegular').fontSize(9).text('SPOR VE OUTDOOR EKİPMANLARI', 55, 72);

    // Document Title
    doc.fillColor('#f0f0ec').font('CustomBold').fontSize(14).text('E-ARŞİV FATURA', 400, 52, { align: 'right', width: 140 });
    doc.fillColor('#888884').font('CustomRegular').fontSize(8).text(`Sipariş No: ${order._id}`, 400, 72, { align: 'right', width: 140 });

    // Reset Color
    doc.fillColor('#333333');

    // --- Info section: Company and Customer ---
    let y = 120;
    
    // Satıcı Bilgileri
    doc.font('CustomBold').fontSize(10).text('SATICI BİLGİLERİ', 40, y);
    doc.font('CustomRegular').fontSize(9).text('Ünvan: Öz Spor & Outdoor', 40, y + 15);
    doc.text('Adres: Gerze, Sinop / Türkiye', 40, y + 30);
    doc.text('E-posta: info@ozsporoutdoor.com', 40, y + 45);
    doc.text('Vergi Dairesi: Gerze V.D.', 40, y + 60);
    doc.text('Vergi No: 1234567890', 40, y + 75);

    // Alıcı Bilgileri
    doc.font('CustomBold').fontSize(10).text('ALICI BİLGİLERİ', 320, y);
    doc.font('CustomRegular').fontSize(9).text(`Adı Soyadı: ${order.customerName}`, 320, y + 15);
    doc.text(`Telefon: ${order.customerPhone}`, 320, y + 30);
    doc.text(`E-posta: ${order.customerEmail}`, 320, y + 45);
    doc.text(`Adres: ${order.shippingAddress}`, 320, y + 60, { width: 230 });
    doc.text(`Bölge: ${order.shippingDistrict} / ${order.shippingCity}`, 320, y + 75);

    // Line separator
    doc.moveTo(40, 215).lineTo(555, 215).stroke('#dddddd');

    // Fatura Detay
    const invoiceDate = new Date(order.createdAt).toLocaleDateString('tr-TR');
    doc.font('CustomBold').fontSize(9).text(`Fatura Tarihi: ${invoiceDate}`, 40, 225);
    doc.text(`Fatura Tipi: Satış`, 320, 225);

    // --- Items Table ---
    y = 250;
    
    // Header
    doc.rect(40, y, 515, 22).fill('#f5f5f5');
    doc.fillColor('#333333').font('CustomBold').fontSize(9);
    doc.text('No', 45, y + 6);
    doc.text('Ürün Açıklaması', 75, y + 6);
    doc.text('Adet', 330, y + 6, { width: 30, align: 'right' });
    doc.text('Birim Fiyat', 370, y + 6, { width: 60, align: 'right' });
    doc.text('KDV', 440, y + 6, { width: 30, align: 'right' });
    doc.text('Tutar', 480, y + 6, { width: 70, align: 'right' });

    doc.font('CustomRegular').fontSize(9);
    y += 22;

    order.items.forEach((item, index) => {
      // Draw grid lines
      doc.moveTo(40, y).lineTo(555, y).stroke('#eeeeee');
      
      const itemSubtotal = item.price * item.quantity;
      const unitExVat = item.price / 1.2; // 20% VAT
      const totalExVat = itemSubtotal / 1.2;

      doc.text(String(index + 1), 45, y + 6);
      doc.text(`${item.name} (${item.size})`, 75, y + 6, { width: 240 });
      doc.text(String(item.quantity), 330, y + 6, { width: 30, align: 'right' });
      doc.text(unitExVat.toFixed(2) + ' ₺', 370, y + 6, { width: 60, align: 'right' });
      doc.text('%20', 440, y + 6, { width: 30, align: 'right' });
      doc.text(itemSubtotal.toFixed(2) + ' ₺', 480, y + 6, { width: 70, align: 'right' });

      y += 22;
    });

    doc.moveTo(40, y).lineTo(555, y).stroke('#dddddd');
    y += 10;

    // --- Summary calculations ---
    const discount = order.discountAmount || 0;
    const finalTotal = order.totalAmount;
    const subtotal = finalTotal / 1.2;
    const vat = finalTotal - subtotal;

    let summaryX = 350;
    doc.font('CustomRegular').fontSize(9);
    
    doc.text('Ara Toplam (KDV Hariç):', summaryX, y, { width: 120, align: 'right' });
    doc.text(subtotal.toFixed(2) + ' ₺', 480, y, { width: 70, align: 'right' });
    y += 15;

    if (discount > 0) {
      doc.text(`İndirim (${order.couponCode || 'KUPON'}):`, summaryX, y, { width: 120, align: 'right' });
      doc.text('-' + discount.toFixed(2) + ' ₺', 480, y, { width: 70, align: 'right' });
      y += 15;
    }

    doc.text('KDV Tutarı (%20):', summaryX, y, { width: 120, align: 'right' });
    doc.text(vat.toFixed(2) + ' ₺', 480, y, { width: 70, align: 'right' });
    y += 15;

    doc.font('CustomBold');
    doc.text('Ödenecek Tutar:', summaryX, y, { width: 120, align: 'right' });
    doc.text(finalTotal.toFixed(2) + ' ₺', 480, y, { width: 70, align: 'right' });
    y += 25;

    // Written text representation of total price
    doc.font('CustomRegular').fontSize(9);
    doc.text(`Yazı ile: # ${numberToWords(finalTotal).toUpperCase()} #`, 40, y - 10);

    // Note / Signature
    y += 20;
    doc.moveTo(40, y).lineTo(555, y).stroke('#eeeeee');
    y += 15;
    
    doc.fontSize(8).fillColor('#888884').text('Bu belge 213 sayılı Vergi Usul Kanunu uyarınca Gelir İdaresi Başkanlığı düzenlemelerine uygun olarak elektronik ortamda oluşturulmuştur. Fatura yerine geçer.', 40, y, { width: 510, align: 'center' });

    doc.end();

    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', err => reject(err));
  });
}

module.exports = { generateInvoicePDF };
