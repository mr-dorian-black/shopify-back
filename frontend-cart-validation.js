// Frontend Cart Validation Example
// Add this to your Shopify theme or checkout page

/**
 * Validate cart before proceeding to checkout
 * Handles stock issues and price mismatches automatically
 */
async function validateAndProceedToCheckout() {
  const cartItems = await getCartItems(); // Your cart data

  try {
    const response = await fetch("/products/validate-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartItems }),
    });

    const result = await response.json();

    if (!result.ok) {
      showError("Failed to validate cart. Please try again.");
      return;
    }

    // Handle validation results
    if (result.canProceedToCheckout) {
      // All items are valid - proceed to checkout
      window.location.href = "/checkout";
      return;
    }

    // Process recommendations
    for (const recommendation of result.recommendations) {
      switch (recommendation.action) {
        case "remove_items":
          // Items are out of stock - must remove
          await handleOutOfStock(recommendation);
          break;

        case "update_prices":
          // Prices changed - ask user to confirm
          await handlePriceChange(recommendation);
          break;

        case "review_items":
          // Other issues
          await handleOtherIssues(recommendation);
          break;
      }
    }
  } catch (error) {
    console.error("Cart validation error:", error);
    showError("Failed to validate cart. Please refresh and try again.");
  }
}

/**
 * Handle out of stock items
 */
async function handleOutOfStock(recommendation) {
  const itemList = recommendation.items.join("\\n• ");

  const message = `
    ❌ The following items are out of stock and will be removed:
    
    • ${itemList}
    
    Click OK to update your cart.
  `;

  if (confirm(message)) {
    // Remove out of stock items from cart
    for (const itemName of recommendation.items) {
      await removeItemFromCart(itemName);
    }

    showSuccess("Cart updated. Out of stock items have been removed.");
    location.reload(); // Refresh cart
  }
}

/**
 * Handle price changes
 */
async function handlePriceChange(recommendation) {
  let message = "⚠️ Some prices have changed:\\n\\n";

  for (const item of recommendation.items) {
    const diff = item.newPrice - item.oldPrice;
    const sign = diff > 0 ? "+" : "";
    message += `• ${item.name}\\n`;
    message += `  Old: $${item.oldPrice.toFixed(2)}\\n`;
    message += `  New: $${item.newPrice.toFixed(2)} (${sign}$${diff.toFixed(2)})\\n\\n`;
  }

  message += "Do you want to continue with updated prices?";

  if (confirm(message)) {
    // Update prices in cart
    for (const item of recommendation.items) {
      await updateItemPrice(item.name, item.newPrice);
    }

    showSuccess("Prices updated. Proceeding to checkout...");
    window.location.href = "/checkout";
  } else {
    showInfo("Please review your cart before checking out.");
  }
}

/**
 * Handle other validation issues
 */
async function handleOtherIssues(recommendation) {
  const itemList = recommendation.items.join("\\n• ");

  alert(`
    ⚠️ Some items need your attention:
    
    • ${itemList}
    
    ${recommendation.message}
  `);
}

/**
 * Example: Get cart items in Shopify format
 */
async function getCartItems() {
  const response = await fetch("/cart.js");
  const cart = await response.json();

  return cart.items.map((item) => ({
    name: item.product_title,
    sku: item.sku,
    price: (item.price / 100).toFixed(2), // Convert cents to dollars
    quantity: item.quantity,
  }));
}

/**
 * Example: Remove item from Shopify cart
 */
async function removeItemFromCart(itemName) {
  const cart = await fetch("/cart.js").then((r) => r.json());
  const item = cart.items.find((i) => i.product_title === itemName);

  if (item) {
    await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.variant_id,
        quantity: 0,
      }),
    });
  }
}

/**
 * Example: Update item price (via line item properties)
 */
async function updateItemPrice(itemName, newPrice) {
  // Note: Shopify doesn't allow direct price changes via cart API
  // You may need to use a different approach:
  // 1. Remove old item and add new with updated price
  // 2. Use draft orders
  // 3. Show price difference at checkout

  console.log(`Price update needed for ${itemName}: $${newPrice}`);
  // Implement based on your setup
}

/**
 * UI Helper functions
 */
function showError(message) {
  alert("❌ " + message);
}

function showSuccess(message) {
  alert("✅ " + message);
}

function showInfo(message) {
  alert("ℹ️ " + message);
}

// ============================================
// Usage: Attach to checkout button
// ============================================

document.addEventListener("DOMContentLoaded", function () {
  const checkoutButton = document.querySelector('[name="checkout"]');

  if (checkoutButton) {
    checkoutButton.addEventListener("click", function (e) {
      e.preventDefault();
      validateAndProceedToCheckout();
    });
  }
});
