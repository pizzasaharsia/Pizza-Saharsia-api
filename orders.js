// ============================================================
// Pizza Saharsia — Order Manager (In-memory + Firebase)
// ============================================================

require('dotenv').config();

// In-memory store (replace with Firebase in production)
const orders = new Map();
const sessions = new Map(); // user session/state store

// ── Session Management ────────────────────────────────────────
function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      phone,
      state: 'start',
      cart: [],
      name: null,
      address: null,
      paymentMethod: null,
      lastActivity: Date.now(),
    });
  }
  const s = sessions.get(phone);
  s.lastActivity = Date.now();
  return s;
}

function updateSession(phone, updates) {
  const s = getSession(phone);
  Object.assign(s, updates);
  sessions.set(phone, s);
  return s;
}

function resetSession(phone) {
  sessions.delete(phone);
  return getSession(phone);
}

// Auto-clear stale sessions (30 min inactivity)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [phone, session] of sessions.entries()) {
    if (session.lastActivity < cutoff && session.state !== 'awaiting_payment') {
      sessions.delete(phone);
    }
  }
}, 5 * 60 * 1000);

// ── Order Management ──────────────────────────────────────────
function generateOrderId() {
  const d = new Date();
  const date = `${d.getDate().toString().padStart(2,'0')}${(d.getMonth()+1).toString().padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `PSH-${date}-${rand}`;
}

function createOrder(session) {
  const id = generateOrderId();
  const subtotal = session.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryCharge = subtotal >= (parseInt(process.env.FREE_DELIVERY_ABOVE) || 299)
    ? 0
    : (parseInt(process.env.DELIVERY_CHARGE) || 30);
  const grandTotal = subtotal + deliveryCharge;

  const order = {
    id,
    phone: session.phone,
    customerName: session.name,
    address: session.address,
    paymentMethod: session.paymentMethod || 'cod',
    items: [...session.cart],
    subtotal,
    deliveryCharge,
    grandTotal,
    status: 'new',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: [{ status: 'new', time: new Date().toISOString() }],
  };

  orders.set(id, order);
  return order;
}

function getOrder(orderId) {
  return orders.get(orderId) || null;
}

function updateOrderStatus(orderId, status) {
  const order = orders.get(orderId);
  if (!order) return null;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  order.timeline.push({ status, time: new Date().toISOString() });
  orders.set(orderId, order);
  return order;
}

function getAllOrders() {
  return Array.from(orders.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getLiveOrders() {
  return getAllOrders().filter(o => !['delivered', 'cancelled'].includes(o.status));
}

function getTodayStats() {
  const today = new Date().toDateString();
  const todayOrders = getAllOrders().filter(
    o => new Date(o.createdAt).toDateString() === today
  );
  return {
    totalOrders: todayOrders.length,
    revenue: todayOrders.reduce((s, o) => s + o.grandTotal, 0),
    newOrders: todayOrders.filter(o => o.status === 'new').length,
    delivered: todayOrders.filter(o => o.status === 'delivered').length,
  };
}

// ── Kitchen Status ────────────────────────────────────────────
let kitchenOpen = true;

function isKitchenOpen() {
  if (!kitchenOpen) return false;
  const now = new Date();
  const hour = now.getHours();
  const openHour = parseInt((process.env.KITCHEN_OPEN_TIME || '11:00').split(':')[0]);
  const closeHour = parseInt((process.env.KITCHEN_CLOSE_TIME || '22:00').split(':')[0]);
  return hour >= openHour && hour < closeHour;
}

function setKitchenStatus(open) {
  kitchenOpen = open;
  return kitchenOpen;
}

module.exports = {
  getSession, updateSession, resetSession,
  createOrder, getOrder, updateOrderStatus,
  getAllOrders, getLiveOrders, getTodayStats,
  isKitchenOpen, setKitchenStatus,
};
