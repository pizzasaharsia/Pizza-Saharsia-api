// ============================================================
// Pizza Saharsia — WhatsApp API Server
// Express + Meta WhatsApp Cloud API Webhook
// ============================================================

require('dotenv').config();
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const cron       = require('node-cron');

const { handleMessage, handleInteractive } = require('./bot');
const wa = require('./whatsapp');
const {
  getLiveOrders, getAllOrders, getOrder,
  updateOrderStatus, getTodayStats, setKitchenStatus,
} = require('./orders');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Dashboard HTML files

// ── Request logger ─────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path !== '/health') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ════════════════════════════════════════════════════════════
//  WEBHOOK — Meta WhatsApp Verification
// ════════════════════════════════════════════════════════════
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  console.warn('❌ Webhook verification failed');
  return res.sendStatus(403);
});

// ════════════════════════════════════════════════════════════
//  WEBHOOK — Incoming WhatsApp Messages
// ════════════════════════════════════════════════════════════
app.post('/webhook', async (req, res) => {
  // Always respond 200 immediately — Meta requires this
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value || change.field !== 'messages') continue;

        // ── Incoming Messages ─────────────────────────────
        for (const msg of value.messages || []) {
          const phone = msg.from;
          const msgId = msg.id;

          // Mark as read
          await wa.markRead(msgId);

          if (msg.type === 'text') {
            await handleMessage(phone, msg.text.body, msgId);
          }

          else if (msg.type === 'interactive') {
            const interactive = msg.interactive;
            if (interactive.type === 'button_reply') {
              const { id, title } = interactive.button_reply;
              await handleInteractive(phone, id, title);
            }
            else if (interactive.type === 'list_reply') {
              const { id, title } = interactive.list_reply;
              await handleInteractive(phone, id, title);
            }
          }

          else if (msg.type === 'image') {
            // Payment screenshot — treat as payment confirmation
            await handleMessage(phone, 'payment_screenshot', msgId);
          }

          else if (msg.type === 'location') {
            const { latitude, longitude } = msg.location;
            await handleMessage(phone, `LOCATION:${latitude},${longitude}`, msgId);
          }

          else {
            // Unsupported type — guide user
            await wa.sendText(phone,
              'Sirf text ya buttons use karein. Help ke liye "help" likhein. 🍕'
            );
          }
        }

        // ── Message Status Updates ─────────────────────────
        for (const status of value.statuses || []) {
          console.log(`📊 Message ${status.id} status: ${status.status} for ${status.recipient_id}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Webhook processing error:', err);
  }
});

// ════════════════════════════════════════════════════════════
//  OWNER REST API — Dashboard endpoints
// ════════════════════════════════════════════════════════════

// Simple API key middleware for owner routes
const ownerAuth = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== process.env.OWNER_API_KEY && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Dashboard stats
app.get('/api/stats', ownerAuth, (req, res) => {
  res.json(getTodayStats());
});

// All orders
app.get('/api/orders', ownerAuth, (req, res) => {
  const status = req.query.status;
  const orders = status
    ? getAllOrders().filter(o => o.status === status)
    : getAllOrders();
  res.json(orders);
});

// Live orders only
app.get('/api/orders/live', ownerAuth, (req, res) => {
  res.json(getLiveOrders());
});

// Single order
app.get('/api/orders/:id', ownerAuth, (req, res) => {
  const order = getOrder(req.params.id.toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// Update order status + send WhatsApp update to customer
app.patch('/api/orders/:id/status', ownerAuth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['accepted', 'preparing', 'dispatched', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
  }

  const order = updateOrderStatus(req.params.id.toUpperCase(), status);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Send WhatsApp update to customer
  try {
    await wa.sendOrderStatus(order.phone, order, status);
    // Schedule rating request after delivery
    if (status === 'delivered') {
      setTimeout(() => wa.sendRatingRequest(order.phone, order.id), 30 * 60 * 1000);
    }
  } catch (e) {
    console.error('WA update failed:', e.message);
  }

  res.json({ success: true, order });
});

// Send custom WhatsApp message to customer
app.post('/api/message', ownerAuth, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone aur message required hai' });
  }
  try {
    await wa.sendText(phone, message);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Broadcast message to multiple customers
app.post('/api/broadcast', ownerAuth, async (req, res) => {
  const { phones, message } = req.body;
  if (!phones?.length || !message) {
    return res.status(400).json({ error: 'phones array aur message required' });
  }
  const results = [];
  for (const phone of phones) {
    try {
      await wa.sendText(phone, message);
      results.push({ phone, success: true });
      await new Promise(r => setTimeout(r, 200)); // Rate limiting
    } catch (e) {
      results.push({ phone, success: false, error: e.message });
    }
  }
  res.json({ results, sent: results.filter(r => r.success).length });
});

// Kitchen open/close toggle
app.post('/api/kitchen', ownerAuth, (req, res) => {
  const { open } = req.body;
  const status = setKitchenStatus(!!open);
  res.json({ kitchenOpen: status, message: `Kitchen ${status ? 'OPEN' : 'CLOSED'}` });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Pizza Saharsia WhatsApp API', time: new Date().toISOString() });
});

// ════════════════════════════════════════════════════════════
//  SCHEDULED TASKS
// ════════════════════════════════════════════════════════════

// Morning greeting broadcast (11 AM)
cron.schedule('0 11 * * *', async () => {
  console.log('📢 Morning broadcast time');
  // Add your regular customers list here
  // await wa.sendText('91XXXXXXXXXX', '🌅 Pizza Saharsia khul gaya! Aaj ka special: ...');
});

// Evening offer reminder (6 PM)
cron.schedule('0 18 * * *', async () => {
  console.log('📢 Evening offers reminder');
  // await wa.sendTemplate('91XXXXXXXXXX', 'evening_offer_template');
});

// Daily revenue summary to owner (11 PM)
cron.schedule('0 23 * * *', async () => {
  const stats = getTodayStats();
  const ownerPhone = process.env.OWNER_PHONE;
  if (ownerPhone && stats.totalOrders > 0) {
    await wa.sendText(ownerPhone,
      `📊 *Aaj ki Report — Pizza Saharsia*\n\n🛒 Total Orders: ${stats.totalOrders}\n✅ Delivered: ${stats.delivered}\n💰 Revenue: ₹${stats.revenue}\n\nKal aur badhiya karte hain! 🍕`
    ).catch(console.error);
  }
});

// ── Start Server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🍕 ════════════════════════════════════════════');
  console.log('   PIZZA SAHARSIA — WhatsApp API Server');
  console.log('🍕 ════════════════════════════════════════════');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Webhook URL: https://YOUR_DOMAIN/webhook`);
  console.log(`📊 Dashboard:  https://YOUR_DOMAIN/`);
  console.log(`🔑 Verify Token: ${process.env.WEBHOOK_VERIFY_TOKEN || 'NOT SET'}`);
  console.log('🍕 ════════════════════════════════════════════');
  console.log('');
});

module.exports = app;
