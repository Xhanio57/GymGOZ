const salesForm = document.getElementById('salesForm');
const barcodeInput = document.getElementById('barcodeInput');
const notification = document.getElementById('notification');
const transactionLog = document.getElementById('transactionLog');
const cartItemsContainer = document.getElementById('cartItems');
const discountInput = document.getElementById('discountInput');
const checkoutBtn = document.getElementById('checkoutBtn');
const clearCartBtn = document.getElementById('clearCartBtn');

let cart = [];
let transactions = [];

// Barkod okutma
salesForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const barcode = barcodeInput.value.trim();

  if (!barcode) {
    showNotification('Lütfen barkod girin', 'error');
    barcodeInput.focus();
    return;
  }

  try {
    const response = await fetch('/api/products?barcode=' + barcode);
    const products = await response.json();
    const product = products.find(p => p.barcode === barcode);

    if (!product) {
      showNotification('Hata: Ürün bulunamadı', 'error');
    } else if (product.stock <= 0) {
      showNotification('Hata: Stok yetersiz', 'error');
    } else {
      addToCart(product);
      showNotification(\`✓ \${product.name} sepete eklendi\`, 'success');
    }
  } catch (error) {
    showNotification('Hata: ' + error.message, 'error');
  } finally {
    barcodeInput.value = '';
    barcodeInput.focus();
  }
});

function addToCart(product) {
  const existingItem = cart.find(item => item._id === product._id);

  if (existingItem) {
    if (existingItem.quantity < product.stock) {
      existingItem.quantity += 1;
    } else {
      showNotification('Stok sınırına ulaştınız', 'error');
    }
  } else {
    cart.push({
      ...product,
      quantity: 1
    });
  }

  updateCart();
}

function updateCart() {
  cartItemsContainer.innerHTML = '';

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<p class="placeholder">Sepet boş</p>';
  } else {
    cart.forEach(item => {
      const itemTotal = item.price * item.quantity;
      const cartItem = document.createElement('div');
      cartItem.className = 'cart-item';
      cartItem.innerHTML = \`
        <div class="cart-item-info">
          <p class="cart-item-name">\${item.name}</p>
          <p class="cart-item-price">\${item.price.toFixed(2)} ₺</p>
        </div>
        <div class="cart-item-controls">
          <button onclick="decreaseQuantity('\${item._id}')" class="qty-btn">−</button>
          <input type="number" value="\${item.quantity}" readonly class="qty-input">
          <button onclick="increaseQuantity('\${item._id}')" class="qty-btn">+</button>
        </div>
        <div class="cart-item-total">
          <p>\${itemTotal.toFixed(2)} ₺</p>
          <button onclick="removeFromCart('\${item._id}')" class="btn-remove">🗑️</button>
        </div>
      \`;
      cartItemsContainer.appendChild(cartItem);
    });
  }

  updateSummary();
}

function increaseQuantity(productId) {
  const item = cart.find(i => i._id === productId);
  if (item && item.quantity < item.stock) {
    item.quantity += 1;
    updateCart();
  }
}

function decreaseQuantity(productId) {
  const item = cart.find(i => i._id === productId);
  if (item && item.quantity > 1) {
    item.quantity -= 1;
    updateCart();
  }
}

function removeFromCart(productId) {
  cart = cart.filter(item => item._id !== productId);
  updateCart();
}

function updateSummary() {
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountPercent = parseFloat(discountInput.value) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  document.getElementById('subtotal').textContent = subtotal.toFixed(2).replace('.', ',') + ' ₺';
  document.getElementById('discountAmount').textContent = discountAmount.toFixed(2).replace('.', ',') + ' ₺';
  document.getElementById('totalPrice').textContent = total.toFixed(2).replace('.', ',') + ' ₺';
}

discountInput.addEventListener('change', updateSummary);

clearCartBtn.addEventListener('click', () => {
  if (confirm('Sepeti temizlemek istediğinize emin misiniz?')) {
    cart = [];
    updateCart();
    showNotification('Sepet temizlendi', 'success');
  }
});

checkoutBtn.addEventListener('click', async () => {
  if (cart.length === 0) {
    showNotification('Sepet boş', 'error');
    return;
  }

  try {
    // Stokları azalt
    for (const item of cart) {
      await fetch(\`/api/satis\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: item.barcode })
      });
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountPercent = parseFloat(discountInput.value) || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const total = subtotal - discountAmount;

    showNotification(\`✓ Satış tamamlandı. Toplam: \${total.toFixed(2)} ₺\`, 'success');
    
    addTransaction(cart, total);
    cart = [];
    discountInput.value = 0;
    updateCart();
  } catch (error) {
    showNotification('Ödeme hatası: ' + error.message, 'error');
  }
});

function addTransaction(items, total) {
  const time = new Date().toLocaleTimeString('tr-TR');
  const transaction = {
    time,
    items: items.map(i => i.name).join(', '),
    total,
    itemCount: items.length
  };

  transactions.unshift(transaction);
  if (transactions.length > 5) transactions.pop();

  updateTransactionLog();
}

function updateTransactionLog() {
  if (transactions.length === 0) {
    transactionLog.innerHTML = '<p class="placeholder">Henüz işlem yapılmamış</p>';
    return;
  }

  transactionLog.innerHTML = transactions
    .map(t => \`
      <div class="transaction-item success">
        <span class="icon">✓</span>
        <span class="time">\${t.time}</span>
        <span class="product">\${t.items}</span>
        <span class="price">\${t.total.toFixed(2)} ₺</span>
      </div>
    \`)
    .join('');
}

function showNotification(message, type) {
  notification.textContent = message;
  notification.className = 'notification ' + type;
  notification.classList.remove('hidden');

  setTimeout(() => {
    notification.classList.add('hidden');
  }, 4000);
}

updateCart();
