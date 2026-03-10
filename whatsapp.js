// ============================================================
// Pizza Saharsia — WhatsApp Cloud API Sender
// Meta WhatsApp Business Cloud API v18.0
// ============================================================

const axios = require('axios');
require('dotenv').config();

const BASE_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
};

// ── Core send function ────────────────────────────────────────
async function sendMessage(to, payload) {
  try {
    const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload };
    const res = await axios.post(BASE_URL, body, { headers: HEADERS });
    console.log(`✅ Message sent to ${to}:`, res.data.messages?.[0]?.id);
    return res.data;
  } catch (err) {
    console.error(`❌ Failed to send to ${to}:`, err.response?.data || err.message);
    throw err;
  }
}

// ── Text message ─────────────────────────────────────────────
async function sendText(to, text) {
  return sendMessage(to, {
    type: 'text',
    text: { body: text, preview_url: false },
  });
}

// ── Interactive list message ─────────────────────────────────
async function sendList(to, headerText, bodyText, buttonText, sections) {
  return sendMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      footer: { text: 'Pizza Saharsia — Saharsa ka apna pizza 🍕' },
      action: { button: buttonText, sections },
    },
  });
}

// ── Interactive buttons (max 3) ──────────────────────────────
async function sendButtons(to, bodyText, buttons, headerText = null, footerText = null) {
  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title.substring(0, 20) },
      })),
    },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };
  return sendMessage(to, { type: 'interactive', interactive });
}

// ── Template message (for notifications) ────────────────────
async function sendTemplate(to, templateName, langCode = 'hi', components = []) {
  return sendMessage(to, {
    type: 'template',
    template: {
      name: templateName,
      language: { code: langCode },
      components,
    },
  });
}

// ── Mark message as read ─────────────────────────────────────
async function markRead(messageId) {
  try {
    await axios.post(BASE_URL.replace('/messages', ''), {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }, { headers: HEADERS });
  } catch (e) {
    // Non-critical
  }
}

// ── Pre-built message flows ───────────────────────────────────

async function sendWelcome(to) {
  return sendButtons(
    to,
    '🍕 *Pizza Saharsia* mein aapka swagat hai!\n\nSaharsa ka sabse tasty pizza — ab aapke ghar tak!\n\nMain aapki kaise help kar sakta hoon?',
    [
      { id: 'order_pizza', title: '🍕 Pizza Order Karo' },
      { id: 'view_menu',   title: '📋 Menu Dekho' },
      { id: 'view_offers', title: '🎁 Offers Dekho' },
    ],
    'Pizza Saharsia 🍕',
    '⏰ 11 AM – 10 PM | 📍 Saharsa, Bihar'
  );
}

async function sendMenu(to) {
  const { formatMenuMessage } = require('./menu');
  await sendText(to, formatMenuMessage());
  await new Promise(r => setTimeout(r, 500));
  return sendButtons(
    to,
    'Order karne ke liye pizza number + size bhejein\n_Jaise: "1 M" ya "3 L"_',
    [
      { id: 'order_pizza',   title: '🛒 Order Karo' },
      { id: 'view_combos',   title: '🎓 Combos Dekho' },
      { id: 'back_home',     title: '🏠 Wapas Jayein' },
    ]
  );
}

async function sendOrderConfirmed(to, order) {
  const items = order.items.map(i => `• ${i.name} × ${i.qty} — ₹${i.price * i.qty}`).join('\n');
  const delivery = order.total >= 299 ? 'FREE 🎉' : `₹${process.env.DELIVERY_CHARGE || 30}`;
  return sendButtons(
    to,
    `✅ *Order Confirm!*\n\nOrder ID: *${order.id}*\n\n${items}\n\nDelivery: ${delivery}\n*Total: ₹${order.grandTotal}*\n\n📍 ${order.address}\n⏱️ 25-35 min mein milega`,
    [
      { id: `track_${order.id}`, title: '📍 Track Order' },
      { id: 'new_order',         title: '➕ Naya Order' },
    ],
    `Order #${order.id}`,
    'Koi problem? Humein call karein'
  );
}

async function sendOrderStatus(to, order, status) {
  const statusMap = {
    accepted:   { emoji: '✅', msg: 'Order accept ho gaya! Kitchen shuru ho gayi.' },
    preparing:  { emoji: '🔥', msg: 'Aapka pizza ban raha hai! Thoda intezaar karein.' },
    dispatched: { emoji: '🚴', msg: 'Delivery boy nikal gaya! 15-20 min mein pahunchega.' },
    delivered:  { emoji: '✅', msg: 'Delivered! Khana enjoy karein 😊' },
  };
  const s = statusMap[status] || { emoji: '📦', msg: 'Order update hua.' };
  return sendText(to,
    `${s.emoji} *Order #${order.id} Update*\n\n${s.msg}\n\nStatus: *${status.toUpperCase()}*\n\nKhane ka mazaa lijiye! 🍕`
  );
}

async function sendPaymentDetails(to, total, method) {
  if (method === 'upi') {
    return sendText(to,
      `💳 *UPI Payment Details*\n\nAmount: *₹${total}*\n\nUPI ID: *pizzasaharsia@upi*\nPhonePe/GPay: *+91 XXXXX XXXXX*\nPaytm: *+91 XXXXX XXXXX*\n\n✅ Payment ke baad screenshot bhejein\n\n_Ya COD ke liye "COD" type karein_`
    );
  }
  return sendText(to,
    `💵 *Cash on Delivery Selected*\n\nAmount ready rakhein: *₹${total}*\n\nDelivery par cash dena hoga. UPI bhi accepted hai doorstep par.\n\nOrder confirm ho gaya! 🎉`
  );
}

async function sendRatingRequest(to, orderId) {
  return sendButtons(
    to,
    `😊 Order #${orderId} kaisa tha?\n\nAapka feedback humein better banana mein help karta hai!`,
    [
      { id: `rate5_${orderId}`, title: '⭐⭐⭐⭐⭐ Excellent!' },
      { id: `rate3_${orderId}`, title: '⭐⭐⭐ Theek tha' },
      { id: `rate1_${orderId}`, title: '👎 Problem thi' },
    ],
    'Rate Your Experience'
  );
}

async function sendKitchenClosed(to) {
  return sendText(to,
    `😔 *Kitchen Abhi Band Hai*\n\nHum kal subah 11 AM se phir open honge!\n\n⏰ Working Hours: 11 AM — 10 PM\n📅 Har din (Sunday bhi)\n\nYa call karein: *+91 XXXXX XXXXX*\n\nJaldi milenge! 🍕`
  );
}

async function sendOwnerNotification(newOrder) {
  const ownerPhone = process.env.OWNER_PHONE;
  if (!ownerPhone) return;
  const items = newOrder.items.map(i => `${i.name} × ${i.qty}`).join(', ');
  return sendText(ownerPhone,
    `🔔 *NAYA ORDER!*\n\nOrder: *${newOrder.id}*\nCustomer: ${newOrder.customerName}\nPhone: ${newOrder.phone}\n\nItems: ${items}\nTotal: *₹${newOrder.grandTotal}*\n\nAddress: ${newOrder.address}\nPayment: ${newOrder.paymentMethod.toUpperCase()}\n\n⏰ Order time: ${new Date().toLocaleTimeString('en-IN')}`
  );
}

module.exports = {
  sendText, sendList, sendButtons, sendTemplate, markRead,
  sendWelcome, sendMenu, sendOrderConfirmed, sendOrderStatus,
  sendPaymentDetails, sendRatingRequest, sendKitchenClosed,
  sendOwnerNotification,
};
