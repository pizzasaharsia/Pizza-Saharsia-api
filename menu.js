// ============================================================
// Pizza Saharsia — Menu Data
// ============================================================

const MENU = {
  pizzas: [
    {
      id: 1,
      name: 'Saharsia Special',
      emoji: '🍕',
      desc: 'Paneer + Desi Masala + Extra Cheese — hamari signature pizza',
      type: 'veg',
      sizes: { S: 149, M: 229, L: 349 },
      available: true,
      popular: true,
    },
    {
      id: 2,
      name: 'Margherita Classic',
      emoji: '🧀',
      desc: 'Tomato Sauce + Mozzarella — simple aur delicious',
      type: 'veg',
      sizes: { S: 119, M: 189, L: 289 },
      available: true,
      popular: false,
    },
    {
      id: 3,
      name: 'Chicken Tikka',
      emoji: '🍗',
      desc: 'Juicy chicken tikka + spicy sauce + capsicum',
      type: 'nonveg',
      sizes: { S: 169, M: 259, L: 389 },
      available: true,
      popular: true,
    },
    {
      id: 4,
      name: 'Corn & Capsicum',
      emoji: '🌽',
      desc: 'Sweet corn + capsicum + cheese blend',
      type: 'veg',
      sizes: { S: 129, M: 199, L: 299 },
      available: true,
      popular: false,
    },
    {
      id: 5,
      name: 'Double Cheese Blast',
      emoji: '💛',
      desc: 'Triple cheese + herb seasoning — cheese lovers ke liye',
      type: 'veg',
      sizes: { S: 139, M: 219, L: 329 },
      available: true,
      popular: false,
    },
    {
      id: 6,
      name: 'Chicken Keema',
      emoji: '🥩',
      desc: 'Spicy keema + onion + pepper + special sauce',
      type: 'nonveg',
      sizes: { S: 179, M: 269, L: 399 },
      available: true,
      popular: false,
    },
  ],
  sides: [
    { id: 's1', name: 'Garlic Bread', desc: '4 pieces', emoji: '🥖', price: 69, available: true },
    { id: 's2', name: 'French Fries', desc: 'Regular size', emoji: '🍟', price: 79, available: true },
    { id: 's3', name: 'Chicken Wings', desc: '4 pieces, spicy', emoji: '🍗', price: 129, available: true },
    { id: 's4', name: 'Pasta', desc: 'Arrabbiata / White Sauce', emoji: '🍝', price: 99, available: true },
    { id: 's5', name: 'Cold Drink', desc: '250ml', emoji: '🥤', price: 30, available: true },
  ],
  combos: [
    {
      id: 'c1',
      name: 'Student Combo',
      emoji: '🎓',
      desc: '7" Pizza + French Fries + Cold Drink',
      price: 199,
      available: true,
      popular: true,
    },
    {
      id: 'c2',
      name: 'Family Combo',
      emoji: '👨‍👩‍👧‍👦',
      desc: '12" Pizza + Garlic Bread x2 + Cold Drink x2',
      price: 549,
      available: true,
      popular: true,
    },
    {
      id: 'c3',
      name: 'Date Night',
      emoji: '❤️',
      desc: '2x 9" Pizzas + Pasta + 2 Drinks',
      price: 649,
      available: true,
      popular: false,
    },
  ],
};

// Format menu as WhatsApp message
function formatMenuMessage() {
  let msg = '🍕 *Pizza Saharsia Menu*\n\n';
  msg += '━━━━━━━━━━━━━━━━━━\n';
  msg += '*🟢 VEG PIZZAS*\n';
  MENU.pizzas
    .filter(p => p.type === 'veg' && p.available)
    .forEach(p => {
      msg += `\n*${p.id}. ${p.name}* ${p.popular ? '⭐' : ''}\n`;
      msg += `   ${p.desc}\n`;
      msg += `   S: ₹${p.sizes.S} | M: ₹${p.sizes.M} | L: ₹${p.sizes.L}\n`;
    });

  msg += '\n━━━━━━━━━━━━━━━━━━\n';
  msg += '*🔴 NON-VEG PIZZAS*\n';
  MENU.pizzas
    .filter(p => p.type === 'nonveg' && p.available)
    .forEach(p => {
      msg += `\n*${p.id}. ${p.name}* ${p.popular ? '⭐' : ''}\n`;
      msg += `   ${p.desc}\n`;
      msg += `   S: ₹${p.sizes.S} | M: ₹${p.sizes.M} | L: ₹${p.sizes.L}\n`;
    });

  msg += '\n━━━━━━━━━━━━━━━━━━\n';
  msg += '*🍟 SIDES*\n';
  MENU.sides
    .filter(s => s.available)
    .forEach(s => {
      msg += `• ${s.emoji} ${s.name} — ₹${s.price}\n`;
    });

  msg += '\n━━━━━━━━━━━━━━━━━━\n';
  msg += '*🎁 COMBOS*\n';
  MENU.combos
    .filter(c => c.available)
    .forEach(c => {
      msg += `• ${c.emoji} *${c.name}* — ₹${c.price}\n`;
      msg += `  ${c.desc}\n`;
    });

  msg += '\n━━━━━━━━━━━━━━━━━━\n';
  msg += '_Size: S = 7" | M = 9" | L = 12"_\n';
  msg += '_Order: Pizza ka number + size bhejein_\n';
  msg += '_Jaise: "1 M" = Saharsia Special 9" pizza_';
  return msg;
}

function getItemByInput(input) {
  input = input.toLowerCase().trim();
  // Number + size
  const match = input.match(/^([1-6s])\s*([sml])?/i);
  if (match) {
    const num = parseInt(match[1]);
    const size = (match[2] || 'M').toUpperCase();
    if (!isNaN(num) && num >= 1 && num <= 6) {
      const pizza = MENU.pizzas.find(p => p.id === num);
      if (pizza) return { type: 'pizza', item: pizza, size, price: pizza.sizes[size] };
    }
    if (match[1] === 's') {
      const combo = MENU.combos.find(c => c.id === 'c1');
      return { type: 'combo', item: combo, size: null, price: combo.price };
    }
  }
  // Combo keywords
  if (input.includes('student') || input.includes('combo s')) {
    const combo = MENU.combos.find(c => c.id === 'c1');
    return { type: 'combo', item: combo, size: null, price: combo.price };
  }
  if (input.includes('family') || input.includes('combo f')) {
    const combo = MENU.combos.find(c => c.id === 'c2');
    return { type: 'combo', item: combo, size: null, price: combo.price };
  }
  return null;
}

module.exports = { MENU, formatMenuMessage, getItemByInput };
