# Налаштування licenses.game_key Metafield

## 📋 Що зроблено:

### 1. Додано визначення metafield

**Файл:** `src/utils/create-metafields.js`

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

### 2. Оновлено збереження ключів

**Файл:** `src/services/shopify/orders.js`

Тепер `saveKeysToOrder()` зберігає ключі в **2 metafields**:

1. **`game_keys.delivered_keys`** (JSON) - для Liquid theme
2. **`licenses.game_key`** (текст) - для Storefront API / Customer Account

**Формат `licenses.game_key`:**

```
Game 1: KEY-1234-5678-ABCD
Game 2: KEY-EFGH-9012-IJKL
```

---

## 🚀 Крок 1: Створити Metafield Definition

```bash
# Запустіть сервер якщо не запущений
npm start

# Створіть metafield definitions
curl -X POST http://localhost:3000/metafields/init

# Або використайте скрипт
chmod +x test-metafield.sh
./test-metafield.sh
```

**Очікуваний результат:**

```json
{
  "ok": true,
  "message": "Metafield definitions created"
}
```

---

## ✅ Крок 2: Перевірити в Shopify Admin

1. Відкрийте **Shopify Admin**
2. **Settings** → **Custom data** → **Orders**
3. Знайдіть **"Game Key"**
   - Namespace: `licenses`
   - Key: `game_key`
   - Type: `Single line text`
   - Owner: `Order`
   - ✅ Visible to Storefront API: **Yes**

---

## 🧪 Крок 3: Тестування

### Створіть тестове замовлення:

Webhook автоматично:

1. ✅ Отримає ключі з Kinguin
2. ✅ Збереже в `licenses.game_key`
3. ✅ Надішле email
4. ✅ Спробує виконати fulfillment

### Перевірте metafield через GraphQL:

```graphql
query {
  order(id: "gid://shopify/Order/YOUR_ORDER_ID") {
    metafield(namespace: "licenses", key: "game_key") {
      value
    }
  }
}
```

**Очікуваний результат:**

```json
{
  "metafield": {
    "value": "Red Faction: Armageddon DLC: DZFX-M58C-QL5C-FQY4\nBattlefield 3: ABCD-1234-EFGH-5678"
  }
}
```

---

## 📱 Використання в Storefront API

Тепер ключі доступні через Storefront API (тому що `visibleToStorefrontApi: true`):

```graphql
query ($orderId: ID!) {
  order(id: $orderId) {
    metafield(namespace: "licenses", key: "game_key") {
      value
    }
  }
}
```

Це дозволяє:

- ✅ Показувати ключі в Customer Account UI
- ✅ Створювати custom storefront з доступом до ключів
- ✅ Використовувати в mobile apps через Storefront API

---

## 🎨 Відображення для клієнта

### Варіант 1: Liquid Theme (використовує game_keys.delivered_keys)

Див. файл `main-order.liquid` - вже реалізовано з картинками та кнопкою Copy.

### Варіант 2: Customer Account UI Extension (використовує licenses.game_key)

Для створення розширення потрібно:

1. Shopify CLI app
2. React компонент що читає metafield через Storefront API
3. Extension config з `target: "customer-account.order-status.block.render"`

---

## 🔍 Налагодження

### Metafield не створюється:

```bash
# Перевірте логи сервера
npm start

# Перевірте response
curl -v -X POST http://localhost:3000/metafields/init
```

### Ключі не зберігаються:

```bash
# Перевірте логи webhook при створенні замовлення
# Шукайте: "✅ Keys saved to order ... metafields"
```

### Перевірити що metafield існує в замовленні:

1. Shopify Admin → Orders → [Order]
2. Внизу сторінки натисніть **"Show JSON"**
3. Шукайте:
   ```json
   "metafields": {
     "licenses": {
       "game_key": "..."
     }
   }
   ```

---

## 📊 Структура даних

**`game_keys.delivered_keys`** (JSON для Liquid):

```json
[
  {
    "product": "Game Name",
    "key": "XXXX-XXXX",
    "image": "https://..."
  }
]
```

**`licenses.game_key`** (текст для Storefront API):

```
Game Name: XXXX-XXXX
Game Name 2: YYYY-YYYY
```

---

## 🎯 Наступні кроки

Якщо потрібно створити Customer Account UI Extension:

1. Створіть Shopify app з CLI
2. Додайте extension з типом `customer-account.order-status.block.render`
3. Читайте metafield через GraphQL в React компоненті
4. Deploy extension через `shopify app deploy`

Потрібні інструкції для extension? Дайте знати! 🚀
