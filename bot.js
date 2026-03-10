// ============================================================
// Pizza Saharsia — WhatsApp Bot Engine
// State Machine for complete order flow
// ============================================================

const wa      = require('./whatsapp');
const { getSession, updateSession, resetSession,
        createOrder, isKitchenOpen, getOrder } = require('./orders');
const { getItemByInput, formatMenuMessage }    = require('./menu');

// ── Keyword matching ──────────────────────────────────────────
const KEYWORDS = {
  greet:   /^(hi|hello|namaste|haan|hey|start|menu|order|\u0928\u092e\u0938\u094d\u0924\u0947|1)/i,
  menu:    /menu|kya hai|show|dekhna|list/i,
  order:   /order|banana|chahiye|lena|buy/i,
  track:   /track|kahan|status|kitna time|order status/i,
  offer:   /offer|discount|deal|combo|student|family|sasta/i,
  cancel:  /cancel|nahi chahiye|wapas|band karo/i,
  help:    /help|support|problem|call|contact/i,
  payment: /payment|upi|cash|cod|pay|paytm|gpay|phonepe/i,
  timing:  /time|timing|kab|hours|khula|band/i,
  rating:  /rate|rating|review|feedback|badhiya|ganda|acha/i,
};

// ── Main message handler ─────────────────────────────────────
async function handleMessage(phone, messageText, messageId) {
  const text = (messageText || '').trim();
  const session = getSession(phone);

  console.log(`📨 [${phone}] State: ${session.state} | Msg: "${text}"`);

  // Kitchen closed check (skip for tracking/support)
  if (!isKitchenOpen() && !KEYWORDS.track.test(text) && !KEYWORDS.help.test(text)) {
    if (session.state === 'start' || KEYWORDS.greet.test(text)) {
      return wa.sendKitchenClosed(phone);
    }
  }

  // Route based on current state
  switch (session.state) {
    case 'start':
      return handleStart(phone, text, session);

    case 'main_menu':
      return handleMainMenu(phone, text, session);

    case 'browsing_menu':
      return handleMenuInput(phone, text, session);

    case 'select_size':
      return handleSizeInput(phone, text, session);

    case 'add_more':
      return handleAddMore(phone, text, session);

    case 'get_name':
      return handleGetName(phone, text, session);

    case 'get_address':
      return handleGetAddress(phone, text, session);

    case 'confirm_order':
      return handleConfirmOrder(phone, text, session);

    case 'select_payment':
      return handlePaymentSelect(phone, text, session);

    case 'awaiting_payment':
      return handlePaymentConfirm(phone, text, session);

    default:
      // Global keyword fallback
      return handleGlobalKeywords(phone, text, session);
  }
}

// ── Interactive button reply handler ────────────────────────
async function handleInteractive(phone, buttonId, buttonTitle) {
  const session = getSession(phone);
  console.log(`🔘 [${phone}] Button: ${buttonId}`);

  // Global buttons
  if (buttonId === 'back_home' || buttonId === 'new_order') {
    resetSession(phone);
    return wa.sendWelcome(phone);
  }

  if (buttonId === 'view_menu') {
    updateSession(phone, { state: 'browsing_menu' });
    return wa.sendMenu(phone);
  }

  if (buttonId === 'order_pizza') {
    updateSession(phone, { state: 'browsing_menu' });
    return wa.sendMenu(phone);
  }

  if (buttonId === 'view_offers') {
    return handleOffers(phone);
  }

  if (buttonId === 'view_combos') {
    return handleCombos(phone, session);
  }

  if (buttonId.startsWith('track_')) {
    const orderId = buttonId.replace('track_', '');
    return handleTrackById(phone, orderId);
  }

  if (buttonId.startsWith('rate5_')) {
    await wa.sendText(phone, '⭐⭐⭐⭐⭐ Bahut shukriya! Aapka pyaar humein aur better banana moti karta hai! 🙏\n\nZomato par bhi review den toh bahut khushi hogi! 😊');
    return;
  }
  if (buttonId.startsWith('rate3_')) {
    await wa.sendText(phone, '😊 Shukriya feedback ke liye! Hum aur better karne ki koshish karenge. Agle order par special offer milega! 🎁');
    return;
  }
  if (buttonId.startsWith('rate1_')) {
    await wa.sendText(phone, '😔 Hume bahut dukh hua. Kya problem thi? Batayein toh hum immediately fix karenge.\n\nOwner directly call karein: +91 XXXXX XXXXX');
    return;
  }

  // Payment buttons
  if (buttonId === 'pay_upi') return handlePaymentMethod(phone, 'upi', session);
  if (buttonId === 'pay_cod') return handlePaymentMethod(phone, 'cod', session);
  if (buttonId === 'confirm_yes') return handleFinalConfirm(phone, session);
  if (buttonId === 'confirm_edit') {
    updateSession(phone, { state: 'browsing_menu', cart: [] });
    await wa.sendText(phone, 'Theek hai! Cart clear kar diya. Dobara choose karein:');
    return wa.sendMenu(phone);
  }
}

// ── State Handlers ───────────────────────────────────────────

async function handleStart(phone, text, session) {
  if (KEYWORDS.greet.test(text) || text === '' || text === '1') {
    updateSession(phone, { state: 'main_menu' });
    return wa.sendWelcome(phone);
  }
  return handleGlobalKeywords(phone, text, session);
}

async function handleMainMenu(phone, text, session) {
  if (text === '1' || KEYWORDS.order.test(text) || text.includes('pizza')) {
    updateSession(phone, { state: 'browsing_menu' });
    return wa.sendMenu(phone);
  }
  if (text === '2' || KEYWORDS.track.test(text)) return handleTrack(phone, session);
  if (text === '3' || KEYWORDS.offer.test(text)) return handleOffers(phone);
  if (text === '4' || KEYWORDS.help.test(text)) return handleHelp(phone);
  return handleGlobalKeywords(phone, text, session);
}

async function handleMenuInput(phone, text, session) {
  const item = getItemByInput(text);
  if (item) {
    if (item.type === 'pizza') {
      // Need size selection
      updateSession(phone, { state: 'select_size', pendingItem: item });
      return wa.sendButtons(phone,
        `🍕 *${item.item.name}*\n${item.item.desc}\n\nKaunsa size chahiye?`,
        [
          { id: 'size_S', title: `S — 7" ₹${item.item.sizes.S}` },
          { id: 'size_M', title: `M — 9" ₹${item.item.sizes.M}` },
          { id: 'size_L', title: `L — 12" ₹${item.item.sizes.L}` },
        ],
        'Size Chunein'
      );
    } else {
      // Combo — add directly
      return addToCart(phone, {
        name: item.item.name,
        qty: 1,
        price: item.price,
        size: null,
      }, session);
    }
  }

  // Size shortcut "1 M"
  const directMatch = text.match(/^([1-6])\s+([SML])/i);
  if (directMatch) {
    const itemResult = getItemByInput(text);
    if (itemResult) {
      return addToCart(phone, {
        name: `${itemResult.item.name} (${itemResult.size})`,
        qty: 1,
        price: itemResult.price,
        size: itemResult.size,
      }, session);
    }
  }

  // Fallback
  await wa.sendText(phone, '🤔 Samjha nahi. Pizza ka number bhejein (1-6) + size (S/M/L)\n_Jaise: "1 M" ya "3 L"_');
}

async function handleSizeInput(phone, text, session) {
  const pending = session.pendingItem;
  let size = text.toUpperCase().trim();

  // Handle button presses
  if (text.startsWith('size_')) size = text.replace('size_', '');

  if (!['S', 'M', 'L'].includes(size)) {
    return wa.sendText(phone, 'Size S, M, ya L bhejein.\n_S=7" | M=9" | L=12"_');
  }

  if (!pending) {
    updateSession(phone, { state: 'browsing_menu' });
    return wa.sendMenu(phone);
  }

  await addToCart(phone, {
    name: `${pending.item.name} (${size})`,
    qty: 1,
    price: pending.item.sizes[size],
    size,
  }, { ...session, pendingItem: null });
}

// Handle size button interactive
async function handleInteractiveSizeButton(phone, buttonId, session) {
  const pending = session.pendingItem;
  const size = buttonId.replace('size_', '');
  if (pending && ['S','M','L'].includes(size)) {
    return addToCart(phone, {
      name: `${pending.item.name} (${size})`,
      qty: 1,
      price: pending.item.sizes[size],
      size,
    }, session);
  }
}

async function addToCart(phone, cartItem, session) {
  const newCart = [...(session.cart || []), cartItem];
  const subtotal = newCart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFree = subtotal >= (parseInt(process.env.FREE_DELIVERY_ABOVE) || 299);

  updateSession(phone, { state: 'add_more', cart: newCart, pendingItem: null });

  const cartLines = newCart.map(i => `• ${i.name} × ${i.qty} — ₹${i.price * i.qty}`).join('\n');

  await wa.sendButtons(phone,
    `✅ *${cartItem.name}* add ho gaya!\n\n🛒 *Aapka Cart:*\n${cartLines}\n\nSubtotal: ₹${subtotal}\nDelivery: ${deliveryFree ? 'FREE 🎉' : '₹30'}`,
    [
      { id: 'add_more_item',  title: '➕ Aur Add Karo' },
      { id: 'checkout_now',   title: '✅ Order Confirm' },
    ],
    'Cart'
  );
}

async function handleAddMore(phone, text, session) {
  if (text === 'add_more_item' || /aur|add|zyada|more/i.test(text)) {
    updateSession(phone, { state: 'browsing_menu' });
    return wa.sendMenu(phone);
  }
  if (text === 'checkout_now' || /confirm|order|haan|yes|checkout/i.test(text)) {
    updateSession(phone, { state: 'get_name' });
    return wa.sendText(phone, '🎉 Badhiya! Ab order complete karte hain.\n\nPehle apna *naam* batayein:');
  }

  // Maybe user typed a menu item
  const item = getItemByInput(text);
  if (item) {
    updateSession(phone, { state: 'browsing_menu' });
    return handleMenuInput(phone, text, session);
  }

  return wa.sendButtons(phone,
    'Kya karna hai?',
    [
      { id: 'add_more_item', title: '➕ Aur Add Karo' },
      { id: 'checkout_now',  title: '✅ Order Confirm' },
    ]
  );
}

async function handleGetName(phone, text, session) {
  if (text.length < 2) {
    return wa.sendText(phone, 'Apna naam sahi se bhejein (kam se kam 2 characters)');
  }
  const name = text.charAt(0).toUpperCase() + text.slice(1);
  updateSession(phone, { state: 'get_address', name });
  return wa.sendText(phone,
    `Nice to meet you, *${name}*! 😊\n\nAb apna *delivery address* bhejein:\n_(Mohalla + Gali + Landmark — Saharsa mein)_\n\n_Example: Sant Nagar, Near School, Gali No. 3_`
  );
}

async function handleGetAddress(phone, text, session) {
  if (text.length < 10) {
    return wa.sendText(phone, 'Pura address bhejein jaise: Sant Nagar, Near School, Gali No. 3\n(Delivery boy dhundh sake)');
  }
  updateSession(phone, { state: 'confirm_order', address: text });

  const subtotal = session.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFree = subtotal >= (parseInt(process.env.FREE_DELIVERY_ABOVE) || 299);
  const grandTotal = subtotal + (deliveryFree ? 0 : 30);
  const cartLines = session.cart.map(i => `• ${i.name} × ${i.qty}   ₹${i.price * i.qty}`).join('\n');

  return wa.sendButtons(phone,
    `📋 *Order Summary*\n\n👤 Naam: ${session.name}\n📍 Address: ${text}\n\n${cartLines}\n\nDelivery: ${deliveryFree ? 'FREE 🎉' : '₹30'}\n*Total: ₹${grandTotal}*\n\nSab sahi hai?`,
    [
      { id: 'confirm_yes',  title: '✅ Confirm & Pay' },
      { id: 'confirm_edit', title: '✏️ Edit Karein' },
    ],
    'Order Confirm Karein?'
  );
}

async function handleConfirmOrder(phone, text, session) {
  if (/confirm|yes|haan|ok|pay/i.test(text) || text === 'confirm_yes') {
    updateSession(phone, { state: 'select_payment' });
    return wa.sendButtons(phone,
      '💳 *Payment Method Chunein:*\n\n📱 UPI: pizzasaharsia@upi\n💵 Cash on Delivery (COD)',
      [
        { id: 'pay_upi', title: '📱 UPI / GPay' },
        { id: 'pay_cod', title: '💵 Cash on Delivery' },
      ],
      'Payment'
    );
  }
  if (/edit|nahi|no|change/i.test(text) || text === 'confirm_edit') {
    updateSession(phone, { state: 'browsing_menu', cart: [] });
    await wa.sendText(phone, 'Theek hai! Cart clear. Dobara choose karein:');
    return wa.sendMenu(phone);
  }
  return wa.sendButtons(phone, 'Confirm karein ya edit?',
    [{ id: 'confirm_yes', title: '✅ Confirm' }, { id: 'confirm_edit', title: '✏️ Edit' }]
  );
}

async function handlePaymentSelect(phone, text, session) {
  if (/upi|gpay|phonepe|paytm|online/i.test(text) || text === 'pay_upi') {
    return handlePaymentMethod(phone, 'upi', session);
  }
  if (/cod|cash|naqd|nakad/i.test(text) || text === 'pay_cod') {
    return handlePaymentMethod(phone, 'cod', session);
  }
  return wa.sendButtons(phone, 'UPI ya Cash on Delivery?',
    [{ id: 'pay_upi', title: '📱 UPI / GPay' }, { id: 'pay_cod', title: '💵 Cash' }]
  );
}

async function handlePaymentMethod(phone, method, session) {
  updateSession(phone, { paymentMethod: method });

  if (method === 'cod') {
    // COD — confirm immediately
    return handleFinalConfirm(phone, { ...session, paymentMethod: 'cod' });
  }

  // UPI — ask for screenshot
  const subtotal = session.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const grandTotal = subtotal + (subtotal >= 299 ? 0 : 30);
  updateSession(phone, { state: 'awaiting_payment' });
  return wa.sendPaymentDetails(phone, grandTotal, 'upi');
}

async function handlePaymentConfirm(phone, text, session) {
  // Accept any message as payment screenshot confirmation
  await handleFinalConfirm(phone, session);
}

async function handleFinalConfirm(phone, session) {
  const currentSession = getSession(phone);
  const s = { ...currentSession, ...session };

  if (!s.cart || s.cart.length === 0) {
    resetSession(phone);
    return wa.sendWelcome(phone);
  }

  const order = createOrder(s);
  resetSession(phone);
  updateSession(phone, { state: 'start' });

  // Send confirmation to customer
  await wa.sendOrderConfirmed(phone, order);

  // Notify owner
  await wa.sendOwnerNotification(order).catch(e => console.error('Owner notify failed:', e));

  // Schedule rating request after ~45 min
  setTimeout(async () => {
    const { getOrder } = require('./orders');
    const o = getOrder(order.id);
    if (o && o.status === 'delivered') {
      await wa.sendRatingRequest(phone, order.id);
    }
  }, 45 * 60 * 1000);

  return order;
}

async function handleTrack(phone, session) {
  return wa.sendText(phone,
    '📍 *Order Tracking*\n\nApna Order ID bhejein (jaise: PSH-0103-1234)\n\nYa last order track karne ke liye "last" likhein.'
  );
}

async function handleTrackById(phone, orderId) {
  const { getOrder } = require('./orders');
  const order = getOrder(orderId);
  if (!order) {
    return wa.sendText(phone, `Order ${orderId} nahi mila. Order ID sahi check karein.`);
  }
  const statusMessages = {
    new:        '🆕 Order receive hua — Kitchen mein jayega abhi',
    accepted:   '✅ Order accept ho gaya — Kitchen shuru',
    preparing:  '🔥 Pizza ban raha hai!',
    dispatched: '🚴 Delivery boy rasta par hai!',
    delivered:  '✅ Delivered! Enjoy karein 🍕',
    cancelled:  '❌ Order cancelled ho gaya',
  };
  return wa.sendText(phone,
    `📍 *Order #${orderId} Status*\n\n${statusMessages[order.status] || '📦 Processing'}\n\nItems: ${order.items.map(i=>i.name).join(', ')}\nTotal: ₹${order.grandTotal}\n\nKoi problem? Call: +91 XXXXX XXXXX`
  );
}

async function handleOffers(phone) {
  return wa.sendButtons(phone,
    `🎁 *Pizza Saharsia — Special Offers*\n\n🎓 *Student Combo* — ₹199\n7" Pizza + Fries + Drink\n\n👨‍👩‍👧‍👦 *Family Combo* — ₹549\n12" Pizza + Garlic Bread ×2 + Drinks ×2\n\n🆕 *Pehla Order* — 20% OFF\nCode: *SAHARSIA20*\n\n🔟 *Loyalty* — 10 orders ke baad 1 FREE pizza\n\n⭐ *Zomato Review* — Next order 10% OFF`,
    [
      { id: 'order_pizza',  title: '🍕 Abhi Order Karo' },
      { id: 'back_home',    title: '🏠 Main Menu' },
    ]
  );
}

async function handleCombos(phone, session) {
  return wa.sendButtons(phone,
    `🎁 *Combos*\n\nStudent Combo (S): ₹199\n7" Pizza + Fries + Drink\n\nFamily Combo (F): ₹549\n12" Pizza + Garlic Bread ×2 + Drinks ×2\n\nType "S" ya "F" to add to cart`,
    [
      { id: 'back_home', title: '🏠 Main Menu' },
    ]
  );
}

async function handleHelp(phone) {
  return wa.sendText(phone,
    `📞 *Pizza Saharsia Support*\n\n🕐 *Hours:* 11 AM – 10 PM (Har din)\n\n*Bot Commands:*\n• "menu" — Menu dekhein\n• "order" — Order karein\n• "track" — Order track karein\n• "offer" — Deals dekhein\n• "cancel" — Cancel info\n\n📞 *Direct Call:* +91 XXXXX XXXXX\n\nHum 2 min mein reply denge! 🍕`
  );
}

async function handleGlobalKeywords(phone, text, session) {
  if (KEYWORDS.menu.test(text))    return wa.sendMenu(phone);
  if (KEYWORDS.offer.test(text))   return handleOffers(phone);
  if (KEYWORDS.help.test(text))    return handleHelp(phone);
  if (KEYWORDS.timing.test(text))  {
    return wa.sendText(phone,
      '🕐 *Working Hours:*\nSubah 11 AM se Raat 10 PM tak\nHar din khula hai — Sunday bhi! 🍕'
    );
  }
  if (KEYWORDS.track.test(text)) return handleTrack(phone, session);
  if (KEYWORDS.cancel.test(text)) {
    return wa.sendText(phone,
      '❌ *Order Cancel*\n\nOrder cancel karne ke liye please call karein:\n📞 *+91 XXXXX XXXXX*\n\nBot se cancel karna possible nahi hai. Hume maafi! 🙏'
    );
  }
  if (KEYWORDS.greet.test(text) || text === '1') {
    updateSession(phone, { state: 'main_menu' });
    return wa.sendWelcome(phone);
  }

  // Track by order ID
  if (/PSH-\d{4}-\d{4}/i.test(text)) {
    const id = text.match(/PSH-\d{4}-\d{4}/i)[0].toUpperCase();
    return handleTrackById(phone, id);
  }

  // Unknown
  return wa.sendButtons(phone,
    'Hum samjhe nahi 😅\n\nYeh try karein:',
    [
      { id: 'order_pizza', title: '🍕 Order Karo' },
      { id: 'view_menu',   title: '📋 Menu Dekho' },
      { id: 'view_offers', title: '🎁 Offers' },
    ]
  );
}

module.exports = { handleMessage, handleInteractive };
