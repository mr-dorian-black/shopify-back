#!/bin/bash

# Test метафілд створення
echo "🔧 Creating metafield definition for licenses.game_key..."
echo ""

response=$(curl -s -X POST http://localhost:3000/metafields/init)

echo "Response:"
echo "$response" | jq . 2>/dev/null || echo "$response"
echo ""

if echo "$response" | grep -q '"ok":true'; then
  echo "✅ Metafield definitions created successfully!"
  echo ""
  echo "📋 Перевірте в Shopify Admin:"
  echo "   Settings → Custom data → Orders"
  echo "   Знайдіть: 'Game Key' (namespace: licenses)"
  echo ""
else
  echo "❌ Помилка створення metafield definition"
  echo "   Переконайтеся що сервер запущений: npm start"
fi
