# licenses.game_key Metafield Setup

## 📋 What's Been Done:

### 1. Added metafield definition

**File:** `src/utils/create-metafields.js`

```javascript
{
  name: "Game Key",
  namespace: "licenses",
  key: "game_key",
  type: "single_line_text_field",
  ownerType: "ORDER",
  visibleToStorefrontApi: true,
}
```

### 2. Updated key storage

**File:** `src/services/shopify/orders.js`

Now `saveKeysToOrder()` saves keys to **2 metafields**:

1. **`game_keys.delivered_keys`** (JSON) - for Liquid theme
2. **`licenses.game_key`** (text) - for Storefront API / Customer Account

**Format of `licenses.game_key`:**

```
Game 1: KEY-1234-5678-ABCD
Game 2: KEY-EFGH-9012-IJKL
```

---

## 🚀 Step 1: Create Metafield Definition

```bash
# Start the server if not running
npm start

# Create metafield definitions
curl -X POST http://localhost:3000/metafields/init

# Or use the script
chmod +x test-metafield.sh
./test-metafield.sh
```

**Expected result:**

```json
{
  "ok": true,
  "message": "Metafield definitions created"
}
```

---

## ✅ Step 2: Verify in Shopify Admin

1. Open **Shopify Admin**
2. **Settings** → **Custom data** → **Orders**
3. Find **"Game Key"**
   - Namespace: `licenses`
   - Key: `game_key`
   - Type: `Single line text`
   - Owner: `Order`
   - ✅ Visible to Storefront API: **Yes**

---

## 🧪 Step 3: Testing

### Create a test order:

Webhook will automatically:

1. ✅ Retrieve keys from Kinguin
2. ✅ Save to `licenses.game_key`
3. ✅ Send email
4. ✅ Attempt fulfillment

### Check metafield via GraphQL:

```graphql
query {
  order(id: "gid://shopify/Order/YOUR_ORDER_ID") {
    metafield(namespace: "licenses", key: "game_key") {
      value
    }
  }
}
```

**Expected result:**

```json
{
  "metafield": {
    "value": "Red Faction: Armageddon DLC: DZFX-M58C-QL5C-FQY4\nBattlefield 3: ABCD-1234-EFGH-5678"
  }
}
```

---

## 📱 Using in Storefront API

Keys are now available through the Storefront API (because `visibleToStorefrontApi: true`):

```graphql
query ($orderId: ID!) {
  order(id: $orderId) {
    metafield(namespace: "licenses", key: "game_key") {
      value
    }
  }
}
```

This allows:

- ✅ Display keys in Customer Account UI
- ✅ Create custom storefront with key access
- ✅ Use in mobile apps via Storefront API

---

## 🎨 Customer Display

### Option 1: Liquid Theme (uses game_keys.delivered_keys)

See `main-order.liquid` file - already implemented with images and Copy button.

### Option 2: Customer Account UI Extension (uses licenses.game_key)

To create an extension you need:

1. Shopify CLI app
2. React component that reads metafield via Storefront API
3. Extension config with `target: "customer-account.order-status.block.render"`

---

## 🔍 Troubleshooting

### Metafield not created:

```bash
# Check server logs
npm start

# Check response
curl -v -X POST http://localhost:3000/metafields/init
```

### Keys not saved:

```bash
# Check webhook logs when creating an order
# Look for: "✅ Keys saved to order ... metafields"
```

### Check if metafield exists in order:

1. Shopify Admin → Orders → [Order]
2. Click **"Show JSON"** at the bottom of the page
3. Look for:
   ```json
   "metafields": {
     "licenses": {
       "game_key": "..."
     }
   }
   ```

---

## 📊 Data Structure

**`game_keys.delivered_keys`** (JSON for Liquid):

```json
[
  {
    "product": "Game Name",
    "key": "XXXX-XXXX",
    "image": "https://..."
  }
]
```

**`licenses.game_key`** (text for Storefront API):

```
Game Name: XXXX-XXXX
Game Name 2: YYYY-YYYY
```

---

## 🎯 Next Steps

If you need to create a Customer Account UI Extension:

1. Create a Shopify app with CLI
2. Add an extension with type `customer-account.order-status.block.render`
3. Read the metafield via GraphQL in a React component
4. Deploy extension with `shopify app deploy`

Need instructions for the extension? Let me know! 🚀
