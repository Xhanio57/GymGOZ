async function sendSMS(phone, message) {
  // Check if SMS feature is explicitly enabled
  if (process.env.SMS_ENABLED !== 'true') {
    console.log('📱 SMS gönderimi şimdilik devre dışı (Aktif etmek için SMS_ENABLED=true yapın).');
    return;
  }

  if (!process.env.SMS_USER || !process.env.SMS_PASS || process.env.SMS_USER.includes('your-')) {
    console.warn('⚠️ SMS ayarları yapılandırılmadığı için SMS bildirimi gönderilemedi.');
    return;
  }

  try {
    const user = process.env.SMS_USER;
    const pass = process.env.SMS_PASS;
    const header = process.env.SMS_HEADER || 'OZSPOR';
    
    // Clean phone number (must be 10 digits starting with 5, e.g., 5xxxxxxxxx)
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('90')) {
      cleanPhone = cleanPhone.substring(2);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }

    if (cleanPhone.length !== 10) {
      console.error('❌ SMS gönderim hatası: Geçersiz telefon numarası formatı:', phone);
      return;
    }

    // Encode message for URL (Netgsm does not support non-ASCII characters natively in URL encoding sometimes, so we replace Turkish chars to prevent encoding errors)
    const trMap = {
      'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
      'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U'
    };
    let cleanMessage = message;
    for (const key in trMap) {
      cleanMessage = cleanMessage.replaceAll(key, trMap[key]);
    }

    const encodedMsg = encodeURIComponent(cleanMessage);
    
    // Netgsm API GET URL
    const url = `https://api.netgsm.com.tr/sms/send/get/?usercode=${user}&password=${pass}&gsmno=${cleanPhone}&message=${encodedMsg}&msgheader=${header}&dil=TR`;

    const response = await fetch(url);
    const text = await response.text();

    // Netgsm success response format starts with "00 " or similar
    if (text.startsWith('00') || text.toLowerCase().includes('success')) {
      console.log(`📱 SMS başarıyla gönderildi: ${cleanPhone}`);
    } else {
      console.error(`❌ SMS gönderim hatası (Netgsm Yanıtı: ${text})`);
    }
  } catch (error) {
    console.error('❌ SMS gönderim hatası:', error);
  }
}

async function sendOrderConfirmationSMS(order) {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  const message = `Sayin ${order.customerName}, #${shortId} nolu Oz Spor & Outdoor siparisiniz alinmis ve onaylanmistir. Tutar: ${order.totalAmount.toFixed(2)} TL. Tesekkur ederiz.`;
  await sendSMS(order.customerPhone, message);
}

async function sendOrderFailureSMS(order) {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  const message = `Sayin ${order.customerName}, #${shortId} nolu siparisinizin odeme islemi sirasinda bir sorun olustu ve beklemeye alindi. Detayli bilgi icin sizinle en kisa surede iletisime gecilecektir.`;
  await sendSMS(order.customerPhone, message);
}

module.exports = {
  sendOrderConfirmationSMS,
  sendOrderFailureSMS
};
