function downloadLabelPDF() {
  if (!currentProductId) return;
  
  // Yeni pencerede aç (yazdırma için)
  window.open(`/api/products/${currentProductId}/label-pdf`, '_blank');
}
