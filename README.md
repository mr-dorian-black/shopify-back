# Shopify-Kinguin Integration Backend

Express.js backend for integrating Shopify store with Kinguin API for automated game key fulfillment.

## 🚀 Features

- **Order Processing**: Automatic purchase and delivery of game keys from Kinguin
- **Order Fulfillment**: Automatic fulfillment in Shopify after key delivery
- **Inventory Sync**: Real-time product synchronization with Kinguin
- **Cart Validation**: Pre-checkout validation of product availability and prices
- **Webhooks**: Shopify webhook handlers for orders, refunds, and product updates
- **Auto-Sync Scheduler**: Periodic background synchronization
- **Email Delivery**: Branded email notifications with game keys (via Brevo)
- **Metafields**: Store game keys in order metafields (accessible via Liquid theme & Customer Account UI)
- **Customer Account UI Extension**: React-based extension to display keys in customer's order page

## 📋 API Endpoints

### Products

- `GET /products/check` - Check Shopify products
- `GET /products/count` - Get total products count
- **`POST /products/validate-cart`** - Validate cart items before checkout ✨

### Metafields

- `POST /metafields/init` - Create metafield definitions for storing game keys

### Sync

- `POST /sync/full` - Start full product sync
- `POST /sync/auto/start` - Start auto-sync scheduler
- `POST /sync/auto/stop` - Stop auto-sync scheduler
- `GET /sync/auto/status` - Get scheduler status
- `POST /sync/auto/run-now` - Manual sync batch

### Webhooks

- `POST /webhooks/orders/create` - Handle new orders
- `POST /webhooks/orders/cancelled` - Handle cancelled orders
- `POST /webhooks/refunds/create` - Handle refunds
- `POST /webhooks/products/update` - Handle product updates
- `POST /webhooks/register` - Register single webhook
- `POST /webhooks/register-all` - Register all webhooks
- `GET /webhooks/list` - List registered webhooks
- `DELETE /webhooks/delete/:id` - Delete webhook

## 🛒 Cart Validation (Pre-Checkout)

Validate cart items **before** customer proceeds to checkout to prevent order failures.

```bash
curl -X POST http://localhost:3000/products/validate-cart \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "name": "Product Name",
        "sku": "12345",
        "price": "29.99",
        "quantity": 1
      }
    ]
  }'
```

**Features:**

- ✅ Check product availability in Kinguin
- ✅ Validate stock levels
- ✅ Detect price mismatches
- ✅ Get actionable recommendations
- ✅ Block checkout if items unavailable

**Response:**

```json
{
  "ok": true,
  "canProceedToCheckout": true,
  "items": [...],
  "summary": {
    "total": 1,
    "valid": 1,
    "invalid": 0,
    "outOfStock": 0,
    "priceMismatch": 0
  },
  "recommendations": []
}
```

See [WEBHOOKS.md](WEBHOOKS.md#-cart-validation-pre-checkout) for complete documentation with frontend integration examples.

## ⚙️ Environment Variables

Copy `env.example` to `.env` and fill in your values:

```bash
cp env.example .env
```

**Required Environment Variables:**

```env
# Kinguin API
KINGUIN_API_KEY=your_kinguin_api_key_here

# Shopify
SHOPIFY_STORE=your-store-name
SHOPIFY_CLIENT_ID=your_client_id_here
SHOPIFY_SECRET_KEY=your_secret_key_here
SHOPIFY_LOCATION_ID=gid://shopify/Location/YOUR_LOCATION_ID

# Brevo Email Service (https://www.brevo.com)
# Get your API key from: https://app.brevo.com/settings/keys/api
BREVO_API_KEY=your_brevo_api_key_here
BREVO_SENDER_EMAIL=noreply@yourdomain.com
BREVO_SENDER_NAME=Your Store Name

# Email Branding (Optional)
# Upload your logo to a CDN/hosting and paste the URL here
LOGO_URL=https://your-cdn.com/logo.png

# Server
PORT=3000
```

**How to get these values:**

- **Kinguin API Key**: Register at [Kinguin Developer Portal](https://developer.kinguin.io/)
- **Shopify Credentials**: Create a custom app in Shopify Admin → Apps → App and sales channel settings → Develop apps
- **Shopify Location ID**: Found in Admin → Settings → Locations (or via GraphQL query)
- **Brevo API Key**: Sign up at [Brevo](https://www.brevo.com), then go to Settings → API Keys

## 🚀 Installation

```bash
# Install dependencies
npm install

# Copy environment variables template
cp env.example .env

# Edit .env with your credentials
nano .env  # or use your preferred editor

# Create metafield definitions in Shopify
curl -X POST http://localhost:3000/metafields/init

# Run development server
npm run dev

# Run production server
npm start
```

## 🔧 Development with ngrok

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Start ngrok
ngrok http 3000

# Register webhooks with ngrok URL
curl -X POST http://localhost:3000/webhooks/register-all \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://your-ngrok-url.ngrok.io"}'
```

## 📁 Project Structure

```
shopify-back/
├── src/
│   ├── app.js                 # Express app setup
│   ├── config/                # Configuration
│   │   ├── axios.js           # API clients
│   │   ├── const.js           # Constants
│   │   └── env.js             # Environment variables
│   ├── routes/                # API routes
│   │   ├── index.js           # Main routes (auth, metafields)
│   │   ├── products.js        # Product endpoints
│   │   ├── sync.js            # Sync endpoints
│   │   └── webhooks.js        # Webhook handlers
│   ├── services/              # Business logic
│   │   ├── email/             # Brevo email service
│   │   │   └── mailer.js
│   │   ├── kinguin/           # Kinguin API integration
│   │   │   ├── orders.js
│   │   │   ├── products.js
│   │   │   └── validation.js
│   │   ├── shopify/           # Shopify GraphQL & API
│   │   │   ├── auth.js
│   │   │   ├── bulk.js
│   │   │   ├── customers.js
│   │   │   ├── orders.js
│   │   │   ├── products.js
│   │   │   └── webhooks.js
│   │   └── sync/              # Auto-sync scheduler
│   │       └── scheduler.js
│   └── utils/                 # Utilities
│       ├── bulk-helpers.js
│       ├── create-metafields.js
│       ├── logger.js
│       └── product-builder.js
├── extensions/                # Shopify UI Extensions
│   └── order-keys/            # Customer Account UI extension
│       ├── src/
│       │   └── OrderKey.jsx   # React component
│       ├── shopify.extension.toml
│       ├── package.json
│       └── README.md
├── index.js                   # Server entry point
├── package.json
├── env.example                # Environment variables template
├── shopify.app.toml           # Shopify CLI app config
├── WEBHOOKS.md                # Webhook documentation
├── LICENSES_METAFIELD_SETUP.md
├── CUSTOMER_ACCOUNT_UI_FULL_GUIDE.md
├── QUICK_START_UI_EXTENSION.md
└── test-cart-validation.sh    # Test script
```

## 🧪 Testing

```bash
# Test cart validation
./test-cart-validation.sh

# Manual cart validation test
curl -X POST http://localhost:3000/products/validate-cart \
  -H "Content-Type: application/json" \
  -d '{"items": [{"name": "Test", "sku": "123", "price": "9.99", "quantity": 1}]}'
```

## 📚 Documentation

- [WEBHOOKS.md](WEBHOOKS.md) - Complete webhook documentation
- [LICENSES_METAFIELD_SETUP.md](LICENSES_METAFIELD_SETUP.md) - Metafield setup guide
- [CUSTOMER_ACCOUNT_UI_FULL_GUIDE.md](CUSTOMER_ACCOUNT_UI_FULL_GUIDE.md) - Customer Account UI Extension guide
- [QUICK_START_UI_EXTENSION.md](QUICK_START_UI_EXTENSION.md) - Quick setup for UI extension
- [Shopify GraphQL API](https://shopify.dev/docs/api/admin-graphql)
- [Kinguin API Docs](https://developer.kinguin.io/)
- [Brevo Email API](https://developers.brevo.com/)

## 🔒 Security Notes

- ⚠️ Add HMAC webhook verification in production
- ⚠️ Implement rate limiting
- ✅ Use environment variables for sensitive data
- ✅ Enable HTTPS in production (required for webhooks)
- ✅ Use Brevo API (more secure than SMTP)

**Webhook Verification Example:**

```javascript
const crypto = require("crypto");

function verifyWebhook(data, hmacHeader) {
  const hash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(data, "utf8")
    .digest("base64");

  return hash === hmacHeader;
}
```

## 📝 TODO

### High Priority

- [ ] Add HMAC webhook verification
- [ ] Implement rate limiting
- [ ] Add webhook logging to database

### Medium Priority

- [ ] Real-time inventory sync (every 5-10 minutes)
- [ ] Cache validation results
- [ ] Kinguin order cancellation handling
- [ ] Key deactivation on refunds

### Low Priority

- [ ] Add comprehensive error logging
- [ ] Write unit tests
- [ ] Add retry logic for failed Kinguin orders
- [ ] Implement products/update webhook handler

## 📄 License

MIT
