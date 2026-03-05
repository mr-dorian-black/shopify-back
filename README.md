# Shopify-Kinguin Integration Backend

Express.js backend for integrating Shopify store with Kinguin API for automated game key fulfillment.

## 🚀 Features

- **Order Processing**: Automatic purchase and delivery of game keys from Kinguin
- **Inventory Sync**: Real-time product synchronization with Kinguin
- **Cart Validation**: Pre-checkout validation of product availability and prices
- **Webhooks**: Shopify webhook handlers for orders, refunds, and product updates
- **Auto-Sync Scheduler**: Periodic background synchronization

## 📋 API Endpoints

### Products

- `GET /products/check` - Check Shopify products
- `GET /products/count` - Get total products count
- **`POST /products/validate-cart`** - Validate cart items before checkout ✨

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

Validate cart items **before** customer proceeds to checkout:

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

**Response:**

```json
{
  "ok": true,
  "valid": true,
  "items": [...],
  "summary": {
    "total": 1,
    "valid": 1,
    "invalid": 0
  },
  "errors": []
}
```

See [WEBHOOKS.md](WEBHOOKS.md) for detailed documentation.

## ⚙️ Environment Variables

Create `.env` file with:

```env
# Kinguin API
KINGUIN_API_KEY=your_kinguin_api_key

# Shopify
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_SECRET_KEY=your_secret_key
SHOPIFY_STORE=your_store_name
SHOPIFY_LOCATION_ID=gid://shopify/Location/xxxxx

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_password
SMTP_FROM=noreply@yourstore.com

# Server
PORT=3000
```

## 🚀 Installation

```bash
# Install dependencies
npm install

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
│   │   ├── index.js
│   │   ├── products.js        # Product endpoints
│   │   ├── sync.js            # Sync endpoints
│   │   └── webhooks.js        # Webhook handlers
│   ├── services/              # Business logic
│   │   ├── email/             # Email service
│   │   ├── kinguin/           # Kinguin API integration
│   │   ├── shopify/           # Shopify GraphQL
│   │   └── sync/              # Auto-sync scheduler
│   └── utils/                 # Utilities
│       ├── bulk-helpers.js
│       ├── create-metafields.js
│       └── product-builder.js
├── index.js                   # Server entry point
├── package.json
├── WEBHOOKS.md               # Webhook documentation
└── test-cart-validation.sh   # Test script
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
- [Shopify GraphQL API](https://shopify.dev/docs/api/admin-graphql)
- [Kinguin API Docs](https://developer.kinguin.io/)

## 🔒 Security Notes

- Add HMAC webhook verification in production
- Implement rate limiting
- Use environment variables for sensitive data
- Enable HTTPS in production

## 📝 TODO

- [ ] Add HMAC webhook verification
- [ ] Implement rate limiting
- [ ] Add webhook logging to database
- [ ] Real-time inventory sync (every 5-10 minutes)
- [ ] Cache validation results
- [ ] Add comprehensive error logging
- [ ] Write unit tests

## 📄 License

MIT
