const fs = require('fs');

async function sendResendEmail({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY ayarlanmadığı için e-posta gönderilemedi.');
    return;
  }

  // Fallback to onboarding@resend.dev if custom domain is not verified
  const from = process.env.RESEND_FROM || process.env.SMTP_FROM || 'onboarding@resend.dev';

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map(att => {
      const fileBuffer = fs.readFileSync(att.path);
      return {
        filename: att.filename,
        content: fileBuffer.toString('base64')
      };
    });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`✉️ E-posta başarıyla gönderildi (Resend): ${to}. Message ID: ${result.id}`);
    } else {
      console.error('❌ Resend E-posta gönderim hatası:', result);
      // If it fails because of sender email verification, retry using onboarding@resend.dev
      if (result.message && result.message.includes('onboarding@resend.dev') && from !== 'onboarding@resend.dev') {
        console.warn('⚠️ Alan adı doğrulanmadığı için onboarding@resend.dev ile tekrar deneniyor...');
        payload.from = 'onboarding@resend.dev';
        const retryRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const retryResult = await retryRes.json();
        if (retryRes.ok) {
          console.log(`✉️ E-posta başarıyla gönderildi (Resend onboarding): ${to}`);
        } else {
          console.error('❌ Resend onboarding denemesi de başarısız:', retryResult);
        }
      }
    }
  } catch (err) {
    console.error('❌ Resend API bağlantı hatası:', err);
  }
}

async function sendOrderConfirmationEmail(order) {
  try {
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

    const attachments = [];
    if (order.invoicePdfUrl) {
      const path = require('path');
      attachments.push({
        filename: `E-Arsiv_Fatura_${order._id}.pdf`,
        path: path.join(__dirname, '../public', order.invoicePdfUrl)
      });
    }

    await sendResendEmail({
      to: order.customerEmail,
      subject: `Siparişiniz Onaylandı! #${order._id.toString().slice(-8).toUpperCase()}`,
      html: emailHtml,
      attachments
    });
  } catch (error) {
    console.error('❌ Sipariş onay e-postası gönderme hatası:', error);
  }
}

async function sendOrderFailureEmail(order, reason = '') {
  try {
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

          <p>Ödeme ile ilgili yaşanan soruna dair sizinle en kısa sürede iletişime geçilecektir. Siparişinizin durumunu öğrenmek veya ödemeyi tekrar denemek için hesabım panelini ziyaret edebilir ya da müşteri hizmetlerimizle iletişime geçebilirsiniz.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://ozsporoutdoor.com/account" style="background-color: #0a0a0a; color: #d4ff00; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; text-transform: uppercase; font-size: 13px;">Hesabıma Git</a>
          </div>

          <p style="font-size: 12px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px;">
            Bu e-posta otomatik olarak gönderilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    `;

    await sendResendEmail({
      to: order.customerEmail,
      subject: `Ödeme Başarısız / Beklemede #${order._id.toString().slice(-8).toUpperCase()}`,
      html: emailHtml
    });
  } catch (error) {
    console.error('❌ Ödeme başarısız e-postası gönderme hatası:', error);
  }
}

async function sendOrderPendingEmail(order) {
  try {
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
          <h2 style="color: #f59e0b; margin-top: 0;">Sipariş Talebiniz Alındı ⏳</h2>
          <p>Merhaba <strong>${order.customerName}</strong>,</p>
          <p>#${order._id.toString().slice(-8).toUpperCase()} numaralı sipariş talebiniz sistemimize ulaşmıştır. Ödeme işlemi onaylandığında siparişinizin hazırlık süreci başlayacaktır.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0 0 8px;"><strong>Sipariş No:</strong> #${order._id.toString().slice(-8).toUpperCase()}</p>
            <p style="margin: 0 0 8px;"><strong>Durum:</strong> Ödeme Bekleniyor / Kontrol Ediliyor</p>
            <p style="margin: 0;"><strong>Teslimat Adresi:</strong> ${order.shippingAddress} ${order.shippingDistrict} / ${order.shippingCity}</p>
          </div>

          <h3 style="border-bottom: 2px solid #333; padding-bottom: 6px;">Sipariş Detayı</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Ürün</th>
                <th style="padding: 10px; text-align: center;">Adet</th>
                <th style="padding: 10px; text-align: right;">Fiyat</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr>
                <td colspan="2" style="padding: 10px; font-weight: bold; text-align: right; border-top: 2px solid #333;">Toplam:</td>
                <td style="padding: 10px; font-weight: bold; text-align: right; border-top: 2px solid #333;">${order.totalAmount.toFixed(2)} ₺</td>
              </tr>
            </tbody>
          </table>

          <p style="font-size: 12px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px;">
            Bu e-posta otomatik olarak gönderilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    `;

    await sendResendEmail({
      to: order.customerEmail,
      subject: `Sipariş Talebiniz Alındı #${order._id.toString().slice(-8).toUpperCase()}`,
      html: emailHtml
    });
  } catch (error) {
    console.error('❌ Sipariş alındı e-postası gönderme hatası:', error);
  }
}

async function sendOrderShippedEmail(order) {
  try {
    const itemsHtml = order.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name} (${item.size})</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">x${item.quantity}</td>
      </tr>
    `).join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #0a0a0a; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 2px;">ÖZ SPOR <span style="color: #d4ff00;">&</span> OUTDOOR</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <h2 style="color: #8b5cf6; margin-top: 0;">Siparişiniz Kargoya Verildi! 🚚</h2>
          <p>Merhaba <strong>${order.customerName}</strong>,</p>
          <p>#${order._id.toString().slice(-8).toUpperCase()} numaralı siparişiniz kargo firmasına teslim edilmiştir.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0 0 8px;"><strong>Kargo Firması:</strong> ${order.cargoProvider || 'Yurtiçi Kargo'}</p>
            <p style="margin: 0 0 8px;"><strong>Takip Numarası:</strong> <span style="font-family: monospace; font-weight: bold;">${order.cargoTrackingNo || 'Takip No Belirtilmedi'}</span></p>
            <p style="margin: 0;"><strong>Teslimat Adresi:</strong> ${order.shippingAddress} ${order.shippingDistrict} / ${order.shippingCity}</p>
          </div>

          <h3 style="border-bottom: 2px solid #333; padding-bottom: 6px;">Sipariş İçeriği</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Ürün</th>
                <th style="padding: 10px; text-align: center;">Adet</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <p style="font-size: 12px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px;">
            Bu e-posta otomatik olarak gönderilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    `;

    await sendResendEmail({
      to: order.customerEmail,
      subject: `Siparişiniz Kargoya Verildi! #${order._id.toString().slice(-8).toUpperCase()}`,
      html: emailHtml
    });
  } catch (error) {
    console.error('❌ Kargo e-postası gönderme hatası:', error);
  }
}

async function sendOrderDeliveredEmail(order) {
  try {
    const googleReviewUrl = `https://www.google.com/search?sca_esv=f07c4d704701945c&sxsrf=APpeQnup0GXkgcqM7p6U1AICtIItDQvv4g:1784142524276&q=oz+spor+outdoor&si=APenkKm7iecQ4G6P-TsbSMFKIQtv3EFIqRAFw-i8uEbk55Z-_8rKBzcRoq2KiAuPOPKhjnQ6K-x6jpaAwwqz9wh-gKZJvnRYKRQaihRGKzmSwYm1YME3qjs%3D&uds=AJ5uw195I-HiO8RgG3HHbr6KY2_8aNr2LBRztYQJt3Uye1cVeSun0hpuRRx5TjZ2lNnSo8tRHHcpliyMGbtm0wNE_oCpv5fHgXbYcT4_ROl6Yr3CcLV_Z9M&sa=X&ved=2ahUKEwi00IzrsNWVAxU9g_0HHQEjEbQQ3PALegQILxAF&biw=1470&bih=770&dpr=2`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #0a0a0a; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-family: 'Bebas Neue', Arial, sans-serif; letter-spacing: 2px;">ÖZ SPOR <span style="color: #d4ff00;">&</span> OUTDOOR</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #eee; border-top: none;">
          <h2 style="color: #10b981; margin-top: 0;">Siparişiniz Teslim Edildi! 🎉</h2>
          <p>Merhaba <strong>${order.customerName}</strong>,</p>
          <p>#${order._id.toString().slice(-8).toUpperCase()} numaralı siparişiniz başarıyla teslim edilmiştir. Ürünlerinizi güzel ve sağlıklı günlerde kullanmanızı dileriz.</p>
          
          <div style="background-color: #fcfdf5; border: 1px dashed #d4ff00; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #0a0a0a; font-size: 16px;">Deneyiminizi Paylaşın 💬</h3>
            <p style="font-size: 13px; color: #555; margin-bottom: 15px;">Alışveriş deneyiminiz bizim için çok değerli. Bize destek olmak ve diğer sporculara rehberlik etmek için Google üzerinden yorum bırakarak bizi değerlendirebilirsiniz.</p>
            <a href="${googleReviewUrl}" target="_blank" style="display: inline-block; background-color: #d4ff00; color: #0a0a0a; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; border: 1px solid #c5eb00;">Google'da Bizi Değerlendirin</a>
          </div>

          <p style="font-size: 12px; color: #888; margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px;">
            Bu e-posta otomatik olarak gönderilmiştir. Sorularınız için bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    `;

    await sendResendEmail({
      to: order.customerEmail,
      subject: `Siparişiniz Teslim Edildi! #${order._id.toString().slice(-8).toUpperCase()}`,
      html: emailHtml
    });
  } catch (error) {
    console.error('❌ Teslimat e-postası gönderme hatası:', error);
  }
}

module.exports = {
  sendOrderConfirmationEmail,
  sendOrderFailureEmail,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendOrderPendingEmail,
  sendResendEmail
};
