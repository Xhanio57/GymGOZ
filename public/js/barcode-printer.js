// Barkod yazdırma fonksiyonu zaten admin-inventory.ejs içinde tanımlanmıştır
// Bu dosya gerekirse gelecekte ek barkod işlevleri için kullanılabilir

function generateBarcodeData(barcode) {
  return {
    value: barcode,
    format: 'CODE128',
    displayValue: true,
    width: 2,
    height: 100
  };
}
