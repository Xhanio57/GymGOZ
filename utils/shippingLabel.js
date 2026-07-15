const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateShippingLabelPDF(order, outputPath) {
  return new Promise((resolve, reject) => {
    // A6 Size is standard for thermal label printers (approx 105 x 148 mm or 297.64 x 419.53 points)
    const doc = new PDFDocument({ size: 'A6', margin: 15 });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Register Turkish fonts
    const regularFont = path.join(__dirname, '../public/fonts/Roboto-Regular.ttf');
    const boldFont = path.join(__dirname, '../public/fonts/Roboto-Medium.ttf');
    doc.registerFont('CustomRegular', regularFont);
    doc.registerFont('CustomBold', boldFont);

    doc.font('CustomRegular');

    // Outer border
    doc.rect(10, 10, 278, 400).stroke('#000000');

    // Kargo Firması Header
    const provider = (order.cargoProvider || 'MNG KARGO').toUpperCase();
    doc.rect(10, 10, 278, 35).fill('#000000');
    doc.fillColor('#ffffff').font('CustomBold').fontSize(14).text(provider, 15, 20, { align: 'center', width: 268 });

    // Reset color to black
    doc.fillColor('#000000').font('CustomRegular');

    // Ship tracking simulator info
    const trackingNo = order.cargoTrackingNo || '123456789012';
    doc.fontSize(9).font('CustomBold').text('TAKİP NO:', 20, 60);
    doc.fontSize(12).text(trackingNo, 20, 72);

    // Simulated Barcode (draw lines to look like a barcode)
    let barcodeX = 40;
    let barcodeY = 95;
    doc.rect(barcodeX, barcodeY, 200, 45).fill('#ffffff');
    
    // Draw pseudo random lines for barcode
    doc.fillColor('#000000');
    for (let i = 0; i < 180; i += 3) {
      let width = (i % 7 === 0 || i % 13 === 0) ? 2 : 1;
      if (i % 17 !== 0) {
        doc.rect(barcodeX + i, barcodeY, width, 40).fill();
      }
    }
    
    // Barcode text underneath
    doc.fontSize(8).text(`*${order._id}*`, 15, barcodeY + 43, { align: 'center', width: 268 });

    // Separator line
    doc.moveTo(10, 155).lineTo(288, 155).stroke('#000000');

    // ALICI (Recipient) - BIG TEXT
    doc.font('CustomBold').fontSize(10).text('ALICI (RECIPIENT)', 20, 165);
    doc.fontSize(12).text(order.customerName, 20, 180);
    doc.font('CustomRegular').fontSize(10).text(`Tel: ${order.customerPhone}`, 20, 196);
    doc.text(order.shippingAddress, 20, 212, { width: 250, height: 70 });
    doc.font('CustomBold').fontSize(11).text(`${order.shippingDistrict.toUpperCase()} / ${order.shippingCity.toUpperCase()}`, 20, 260);

    // Separator line
    doc.moveTo(10, 285).lineTo(288, 285).stroke('#000000');

    // GÖNDERİCİ (Sender) - SMALLER TEXT
    doc.font('CustomBold').fontSize(8).text('GÖNDERİCİ (SENDER)', 20, 295);
    doc.font('CustomRegular').fontSize(8).text('Öz Spor & Outdoor', 20, 307);
    doc.text('Gerze, Sinop / Türkiye', 20, 317);
    doc.text('Tel: +90 532 XXX XX XX', 20, 327);

    // Order info at the very bottom
    const orderDate = new Date(order.createdAt).toLocaleDateString('tr-TR');
    doc.moveTo(10, 345).lineTo(288, 345).stroke('#000000');
    doc.fontSize(7).text(`Sipariş Ref: ${order._id}`, 20, 355);
    doc.text(`Tarih: ${orderDate}`, 20, 365);
    doc.text(`Paket İçeriği: Spor Malzemesi`, 20, 375);

    doc.end();

    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', err => reject(err));
  });
}

module.exports = { generateShippingLabelPDF };
