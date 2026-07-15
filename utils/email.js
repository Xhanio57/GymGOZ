const nodemailer = require('nodemailer');

async function sendOrderConfirmationEmail(order) {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_USER.includes('your-email')) {
    console.warn('⚠️ SMTP ayarları yapılandırılmadığı için e-posta bildirimi gönderilemedi.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: parseInt(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const itemsHtml = order.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name} (${item.size})</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">x${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${(item.price * item.quantity).toFixed(2)} ₺</td>
      </tr>
    `).join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #0a0a0a; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 2px;">ÖZ SPOR <span style="color: #d4ff00;">&</span> OUTDOOR</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <h2 style="color: #10b981; margin-top: 0;">Siparişiniz Onaylandı! 🎉</h2>
          <p>Merhaba <strong>${order.customerName}</strong>,</p>
          <p>Siparişiniz başarıyla alınmış ve onaylanmıştır. En kısa sürede kargoya verilmek üzere hazırlanmaya başlanacaktır.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0 0 8px;"><strong>Sipariş No:</strong> #${order._id.toString().slice(-8).toUpperCase()}</p>
            <p style="margin: 0 0 8px;"><strong>Tarih:</strong> ${new Date(order.createdAt).toLocaleDateString('tr-TR')}</p>
            <p style="margin: 0;"><strong>Teslimat Adresi:</strong> ${order.shippingAddress} ${order.shippingDistrict} / ${order.shippingCity}</p>
          </div>

          <h3 style="border-bottom: 2px solid #333; padding-bottom: 6px;">Sipariş İçeriği</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Ürün</th>
                <th style="padding: 10px; text-align: center;">Adet</th>
                <th style="padding: 10px; text-align: right;">Tutar</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 10px; font-weight: bold; text-align: right;">Toplam:</td>
                <td style="padding: 10px; font-weight: bold; text-align: right; color: #10b981; font-size: 16px;">${order.totalAmount.toFixed(2)} ₺</td>
              </tr>
            </tfoot>
          </table>

          <p style="font-size: 12px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px;">
            Bu e-posta otomatik olarak gönderilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Öz Spor & Outdoor" <${process.env.SMTP_USER}>`,
      to: order.customerEmail,
      subject: `Siparişiniz Onaylandı! #${order._id.toString().slice(-8).toUpperCase()}`,
      html: emailHtml
    });

    console.log(`✉️ Sipariş onay e-postası başarıyla gönderildi: ${order.customerEmail}`);
  } catch (error) {
    console.error('❌ E-posta gönderim hatası:', error);
  }
}

async function sendOrderFailureEmail(order, reason = '') {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_USER.includes('your-email')) {
    console.warn('⚠️ SMTP ayarları yapılandırılmadığı için e-posta bildirimi gönderilemedi.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: parseInt(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #0a0a0a; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 2px;">ÖZ SPOR <span style="color: #d4ff00;">&</span> OUTDOOR</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <h2 style="color: #ff4d4d; margin-top: 0;">Ödeme Başarısız / Beklemede ⚠️</h2>
          <p>Merhaba <strong>${order.customerName}</strong>,</p>
          <p>#${order._id.toString().slice(-8).toUpperCase()} numaralı siparişinizin ödeme işlemi gerçekleştirilemedi veya banka tarafından beklemeye/incelemeye alındı.</p>
          
          ${reason ? `<div style="background-color: #fff5f5; border-left: 4px solid #ff4d4d; padding: 12px; margin: 20px 0; color: #c53030;">
            <strong>Hata / Gerekçe:</strong> ${reason}
          </div>` : ''}

          <p>Siparişinizin durumunu öğrenmek veya ödemeyi tekrar denemek için hesabım panelini ziyaret edebilir ya da müşteri hizmetlerimizle iletişime geçebilirsiniz.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://ozsporoutdoor.com/account" style="background-color: #0a0a0a; color: #d4ff00; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; text-transform: uppercase; font-size: 13px;">Hesabıma Git</a>
          </div>

          <p style="font-size: 12px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px;">
            Bu e-posta otomatik olarak gönderilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Öz Spor & Outdoor" <${process.env.SMTP_USER}>`,
      to: order.customerEmail,
      subject: `Ödeme Başarısız / Beklemede #${order._id.toString().slice(-8).toUpperCase()}`,
      html: emailHtml
    });

    console.log(`✉️ Ödeme başarısız/beklemede e-postası başarıyla gönderildi: ${order.customerEmail}`);
  } catch (error) {
    console.error('❌ E-posta gönderim hatası:', error);
  }
}

module.exports = {
  sendOrderConfirmationEmail,
  sendOrderFailureEmail
};
