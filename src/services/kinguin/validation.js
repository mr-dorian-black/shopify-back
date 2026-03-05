import { kinguin } from "../../config/axios.js";
import { getProductDetails } from "./products.js";
import { updateProductBySKU } from "../shopify/products.js";

export async function checkKinguinStock(productId) {
  try {
    // Use product details endpoint instead of non-existent /stock endpoint
    const details = await getProductDetails(productId);

    const qty = details.qty || 0;

    return {
      available: qty,
      inStock: qty > 0,
    };
  } catch (error) {
    if (error.response?.status === 404) {
      console.error(
        `❌ Product not found in Kinguin: ${productId} (check if SKU is correct Kinguin productId)`,
      );
      return {
        available: 0,
        inStock: false,
        notFound: true,
        error: "Product not found in Kinguin API",
      };
    }

    console.error(
      `❌ Failed to check stock for ${productId}:`,
      error.response?.data || error.message,
    );
    return { available: 0, inStock: false };
  }
}

export async function checkKinguinPrice(productId) {
  try {
    const details = await getProductDetails(productId);
    return {
      price: details.price,
      currency: details.currency || "EUR",
      originalPrice: details.originalPrice,
    };
  } catch (error) {
    console.error(
      `❌ Failed to check price for ${productId}:`,
      error.response?.data || error.message,
    );
    return null;
  }
}

export async function validateOrderItem(item, shopifyPrice) {
  const kinguinProductId = item.sku;

  if (!kinguinProductId) {
    return {
      valid: false,
      reason: "No SKU found",
      item: item.name,
    };
  }

  console.log(`🔍 Validating: ${item.name} (SKU: ${kinguinProductId})`);

  const stock = await checkKinguinStock(kinguinProductId);

  // Check if product exists in Kinguin
  if (stock.notFound) {
    return {
      valid: false,
      reason: `Product not found in Kinguin (SKU: ${kinguinProductId} is invalid). Please update SKU with correct Kinguin productId.`,
      item: item.name,
      sku: kinguinProductId,
      notFound: true,
    };
  }

  if (!stock.inStock || stock.available < item.quantity) {
    console.log(
      `⚠️ Stock discrepancy detected - updating Shopify (available: ${stock.available})`,
    );

    // Auto-update Shopify with correct quantity
    const updateSuccess = await updateProductBySKU(
      kinguinProductId,
      null, // Don't update price here, will do it later if needed
      stock.available,
    ).catch((err) => {
      console.error("Failed to auto-update quantity:", err.message);
      return false;
    });

    return {
      valid: false,
      reason: `Insufficient stock (available: ${stock.available}, requested: ${item.quantity})${updateSuccess ? ". Stock updated in Shopify." : ""}`,
      item: item.name,
      available: stock.available,
      autoUpdated: updateSuccess,
    };
  }

  console.log(`✅ Stock OK: ${stock.available} available`);

  const priceInfo = await checkKinguinPrice(kinguinProductId);

  if (!priceInfo) {
    return {
      valid: false,
      reason: "Could not verify price",
      item: item.name,
    };
  }

  // Simple price comparison (both prices in EUR)
  const shopifyPriceNum = parseFloat(shopifyPrice);
  const kinguinPriceNum = parseFloat(priceInfo.price);
  const priceDiff = Math.abs(shopifyPriceNum - kinguinPriceNum);
  const priceMargin = kinguinPriceNum * 0.05; // 5% margin

  if (priceDiff > priceMargin) {
    console.warn(
      `⚠️ Price mismatch: Shopify=${shopifyPriceNum}€, Kinguin=${kinguinPriceNum}€`,
    );
    console.log(`🔄 Auto-updating price in Shopify...`);

    // Auto-update Shopify with correct price and quantity
    const updateSuccess = await updateProductBySKU(
      kinguinProductId,
      kinguinPriceNum,
      stock.available,
    ).catch((err) => {
      console.error("Failed to auto-update price:", err.message);
      return false;
    });

    if (updateSuccess) {
      // Successfully updated - cart is now valid with new price
      return {
        valid: true,
        reason: `Price updated automatically (was: ${shopifyPriceNum}€, now: ${kinguinPriceNum}€). Please refresh cart.`,
        item: item.name,
        shopifyPrice: shopifyPriceNum,
        kinguinPrice: kinguinPriceNum,
        autoUpdated: true,
        stock: stock.available,
        price: priceInfo.price,
      };
    } else {
      // Failed to update - cart is invalid
      return {
        valid: false,
        reason: `Price mismatch (Shopify: ${shopifyPriceNum}€, Kinguin: ${kinguinPriceNum}€). Auto-update failed.`,
        item: item.name,
        shopifyPrice: shopifyPriceNum,
        kinguinPrice: kinguinPriceNum,
        autoUpdated: false,
      };
    }
  }

  console.log(`✅ Price OK: ${kinguinPriceNum}€`);

  return {
    valid: true,
    item: item.name,
    stock: stock.available,
    price: priceInfo.price,
  };
}
