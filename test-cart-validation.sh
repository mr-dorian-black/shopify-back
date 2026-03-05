#!/bin/bash

# Test cart validation endpoint
# Usage: ./test-cart-validation.sh

echo "🧪 Testing Cart Validation Endpoint"
echo "===================================="
echo ""

# Test with sample cart items
echo "📦 Testing cart with 2 items..."
echo ""

curl -X POST http://localhost:3000/products/validate-cart \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "name": "Test Product 1",
        "sku": "123456",
        "price": "29.99",
        "quantity": 1
      },
      {
        "name": "Test Product 2",
        "sku": "789012",
        "price": "49.99",
        "quantity": 2
      }
    ]
  }' | jq '.'

echo ""
echo "✅ Test completed"
