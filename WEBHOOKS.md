# Shopify Webhooks Documentation

## 📋 Available Webhooks

### 1. **Orders Create** (`ORDERS_CREATE`)

- **Endpoint:** `POST /webhooks/orders/create`
- **Purpose:** Process new orders
- **Actions:**
  - Validate product availability in Kinguin
  - Verify prices
  - Purchase keys from Kinguin
  - Send keys to customer via email
  - Cancel order on errors

### 2. **Orders Cancelled** (`ORDERS_CANCELLED`)

- **Endpoint:** `POST /webhooks/orders/cancelled`
- **Purpose:** Handle cancelled orders
- **Actions:**
  - Log cancellation reason
  - Process Kinguin refund (TODO)
  - Deactivate issued keys (TODO)

### 3. **Refunds Create** (`REFUNDS_CREATE`)

- **Endpoint:** `POST /webhooks/refunds/create`
- **Purpose:** Handle refund processing
- **Actions:**
  - Log refund amount
  - Deactivate keys (TODO)
  - Request Kinguin refund (TODO)

### 4. **Products Update** (`PRODUCTS_UPDATE`)

- **Endpoint:** `POST /webhooks/products/update`
- **Purpose:** Synchronize product updates
- **Status:** ⚠️ Not yet implemented
- **Planned Actions:**
  - Track price changes
  - Update product availability
  - Sync with Kinguin

---

## 🎯 Metafield Definitions

### Create Metafield Definitions

**Endpoint:** `POST /metafields/init`

**Purpose:** Create custom data metafield definitions in Shopify for storing game keys on orders.

**Created Metafields:**

1. **`game_keys.delivered_keys`** (JSON)
   - Type: `json`
   - Owner: Order
   - Purpose: Store keys with product info and images for Liquid theme display
   - Format: `[{product: "Game Name", key: "XXXX-XXXX", image: "https://..."}]`

2. **`licenses.game_key`** (Single line text)
   - Type: `single_line_text_field`
   - Owner: Order
   - Purpose: Store keys for Customer Account UI Extensions
   - Access: Customer READ (visible in customer account)
   - Format: `"Game 1: KEY-1234\nGame 2: KEY-5678"`

**Request:**

```bash
curl -X POST http://localhost:3000/metafields/init
```

**Response:**

```json
{
  "ok": true,
  "message": "Metafield definitions created successfully",
  "definitions": [
    {
      "namespace": "game_keys",
      "key": "delivered_keys",
      "name": "Delivered Game Keys",
      "type": "json"
    },
    {
      "namespace": "licenses",
      "key": "game_key",
      "name": "Game Key",
      "type": "single_line_text_field"
    }
  ]
}
```

**Note:** This only needs to be run once per Shopify store. After creation, you can verify the metafields in **Shopify Admin → Settings → Custom data → Orders**.

---

## 🚀 Webhook Registration

### Single Registration

**Endpoint:** `POST /webhooks/register`

```bash
curl -X POST http://localhost:3000/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://your-domain.com",
    "topic": "ORDERS_CREATE"
  }'
```

**Parameters:**

- `baseUrl` - Base URL of your server (ngrok or production domain)
- `topic` - Webhook type: `ORDERS_CREATE`, `ORDERS_CANCELLED`, `REFUNDS_CREATE`, `PRODUCTS_UPDATE`

**Response:**

```json
{
  "ok": true,
  "webhook": {
    "id": "gid://shopify/WebhookSubscription/...",
    "topic": "ORDERS_CREATE",
    "callbackUrl": "https://your-domain.com/webhooks/orders/create"
  },
  "url": "https://your-domain.com/webhooks/orders/create"
}
```

### Register All Webhooks

**Endpoint:** `POST /webhooks/register-all`

```bash
curl -X POST http://localhost:3000/webhooks/register-all \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://your-domain.com"
  }'
```

**Response:**

```json
{
  "ok": true,
  "message": "Registered 4/4 webhooks",
  "results": [
    {
      "topic": "ORDERS_CREATE",
      "url": "https://your-domain.com/webhooks/orders/create",
      "success": true,
      "webhook": { ... }
    },
    ...
  ]
}
```

---

## 🛒 Cart Validation (Pre-Checkout)

Since Shopify doesn't provide a webhook for adding items to cart, use this endpoint to validate cart items **before checkout**.

### Validate Cart Items

**Endpoint:** `POST /products/validate-cart`

**Purpose:** Validate product availability and prices in Kinguin before customer proceeds to checkout.

**Request:**

```bash
curl -X POST http://localhost:3000/products/validate-cart \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "name": "Grand Theft Auto V",
        "sku": "12345",
        "price": "29.99",
        "quantity": 1
      },
      {
        "name": "Red Dead Redemption 2",
        "sku": "67890",
        "price": "49.99",
        "quantity": 1
      }
    ]
  }'
```

**Response:**

```json
{
  "ok": true,
  "valid": false,
  "canProceedToCheckout": false,
  "items": [
    {
      "valid": true,
      "item": "Grand Theft Auto V",
      "stock": 150,
      "price": "29.99"
    },
    {
      "valid": false,
      "item": "Red Dead Redemption 2",
      "reason": "Insufficient stock (available: 0, requested: 1)",
      "available": 0
    },
    {
      "valid": false,
      "item": "Cyberpunk 2077",
      "reason": "Price mismatch (Shopify: 49.99, Kinguin: 54.99)",
      "shopifyPrice": 49.99,
      "kinguinPrice": 54.99
    }
  ],
  "summary": {
    "total": 3,
    "valid": 1,
    "invalid": 2,
    "outOfStock": 1,
    "priceMismatch": 1
  },
  "errors": [
    {
      "valid": false,
      "item": "Red Dead Redemption 2",
      "reason": "Insufficient stock (available: 0, requested: 1)",
      "available": 0
    },
    {
      "valid": false,
      "item": "Cyberpunk 2077",
      "reason": "Price mismatch (Shopify: 49.99, Kinguin: 54.99)",
      "shopifyPrice": 49.99,
      "kinguinPrice": 54.99
    }
  ],
  "recommendations": [
    {
      "severity": "error",
      "action": "remove_items",
      "message": "1 item(s) are out of stock and must be removed from cart",
      "items": ["Red Dead Redemption 2"]
    },
    {
      "severity": "warning",
      "action": "update_prices",
      "message": "1 item(s) have price changes. Please review updated prices.",
      "items": [
        {
          "name": "Cyberpunk 2077",
          "oldPrice": 49.99,
          "newPrice": 54.99
        }
      ]
    }
  ]
}
```

### Response Fields Explained

- **`canProceedToCheckout`**: Boolean - if `false`, user must resolve issues before checkout
- **`recommendations`**: Array of actions to take:
  - **`remove_items`** (severity: error): Items are out of stock, must be removed
  - **`update_prices`** (severity: warning): Prices changed, user should confirm new prices
  - **`review_items`** (severity: error): Other validation issues
- **`summary`**: Quick stats about validation results
  - `outOfStock`: Count of unavailable items
  - `priceMismatch`: Count of items with price differences

### Handling Different Scenarios

#### ❌ **Out of Stock**

```json
{
  "valid": false,
  "reason": "Insufficient stock (available: 0, requested: 2)",
  "available": 0
}
```

**Action:** Automatically remove from cart or show "Out of Stock" message

#### ⚠️ **Price Mismatch** (difference > 5%)

```json
{
  "valid": false,
  "reason": "Price mismatch (Shopify: 29.99, Kinguin: 35.00)",
  "shopifyPrice": 29.99,
  "kinguinPrice": 35.0
}
```

**Action:** Show updated price and ask user to confirm

#### ✅ **Valid Item**

```json
{
  "valid": true,
  "item": "Product Name",
  "stock": 150,
  "price": "29.99"
}
```

**Action:** Allow checkout

**Integration Tips:**

1. **Call before checkout:** Add validation when user clicks "Checkout" button
2. **Show errors to user:** Display which items are unavailable or have price changes
3. **Follow recommendations:** Use the `action` field to handle each scenario appropriately
4. **Update cart:** Remove out-of-stock items, update prices with user confirmation
5. **Real-time updates:** Call periodically while user is on cart page
6. **Block checkout:** Don't allow proceeding if `canProceedToCheckout` is `false`

**Example Frontend Code:**

See [frontend-cart-validation.js](frontend-cart-validation.js) for complete implementation.

Quick example:

```javascript
// Attach to checkout button
document
  .querySelector(".checkout-button")
  .addEventListener("click", async (e) => {
    e.preventDefault();

    const response = await fetch("/products/validate-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: getCartItems() }),
    });

    const result = await response.json();

    if (!result.canProceedToCheckout) {
      // Process recommendations
      for (const rec of result.recommendations) {
        if (rec.action === "remove_items") {
          // Items out of stock - must remove
          alert(`❌ Out of stock: ${rec.items.join(", ")}`);
          rec.items.forEach((item) => removeFromCart(item));
        }

        if (rec.action === "update_prices") {
          // Prices changed - ask user
          const changes = rec.items
            .map((i) => `${i.name}: $${i.oldPrice} → $${i.newPrice}`)
            .join("\\n");

          if (confirm(`⚠️ Prices changed:\\n${changes}\\n\\nContinue?`)) {
            // Update cart with new prices
            rec.items.forEach((i) => updatePrice(i.name, i.newPrice));
            window.location.href = "/checkout";
          }
        }
      }

      // Reload cart to show changes
      if (result.summary.outOfStock > 0) {
        location.reload();
      }
    } else {
      // All valid - proceed to checkout
      window.location.href = "/checkout";
    }
  });
```

---

## 📋 List Webhooks

**Endpoint:** `GET /webhooks/list`

```bash
curl http://localhost:3000/webhooks/list
```

**Response:**

```json
{
  "ok": true,
  "count": 4,
  "webhooks": [
    {
      "id": "gid://shopify/WebhookSubscription/...",
      "topic": "ORDERS_CREATE",
      "callbackUrl": "https://your-domain.com/webhooks/orders/create",
      "format": "JSON"
    },
    ...
  ]
}
```

---

## 🗑️ Delete Webhook

**Endpoint:** `DELETE /webhooks/delete/:id`

```bash
curl -X DELETE http://localhost:3000/webhooks/delete/gid://shopify/WebhookSubscription/1234567890
```

**Response:**

```json
{
  "ok": true,
  "message": "Webhook deleted successfully",
  "deletedId": "gid://shopify/WebhookSubscription/1234567890"
}
```

---

## 🔧 Using with ngrok

### 1. Start ngrok

```bash
ngrok http 3000
```

### 2. Copy URL (e.g., `https://abc123.ngrok.io`)

### 3. Register webhooks

```bash
curl -X POST http://localhost:3000/webhooks/register-all \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://abc123.ngrok.io"
  }'
```

---

## ✅ Testing Webhooks

### Via Shopify Admin

1. Go to **Settings → Notifications → Webhooks**
2. Find registered webhooks
3. Click "Send test notification"

### Manually via curl

```bash
# Test orders/create
curl -X POST http://localhost:3000/webhooks/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123456,
    "name": "#1001",
    "line_items": [],
    "customer": {
      "id": 789,
      "email": "test@example.com",
      "first_name": "Test"
    }
  }'
```

---

## 🔒 Security

⚠️ **IMPORTANT:** In production, add Shopify HMAC signature verification:

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

---

## 📝 TODO

- [ ] Add Kinguin order cancellation handling
- [ ] Implement key deactivation on refunds
- [ ] Add automatic price synchronization with Kinguin
- [ ] Add HMAC webhook verification
- [ ] Add rate limiting for endpoint protection
- [ ] Add webhook logging to database
- [ ] Implement real-time inventory sync (every 5-10 minutes)
- [ ] Add cart validation to Shopify theme frontend
- [ ] Cache validation results to improve performance
