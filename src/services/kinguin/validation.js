import { kinguin } from "../../config/axios.js";
import { getProductDetails } from "./products.js";

export async function checkKinguinStock(productId) {
  try {
    const res = await kinguin.get(`/v1/products/${productId}/stock`);
    return {
      available: res.data.available || 0,
      inStock: res.data.available > 0,
    };
  } catch (error) {
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

  if (!stock.inStock || stock.available < item.quantity) {
    return {
      valid: false,
      reason: `Insufficient stock (available: ${stock.available}, requested: ${item.quantity})`,
      item: item.name,
      available: stock.available,
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

  const shopifyPriceNum = parseFloat(shopifyPrice);
  const kinguinPriceNum = parseFloat(priceInfo.price);
  const priceDiff = Math.abs(shopifyPriceNum - kinguinPriceNum);
  const priceMargin = kinguinPriceNum * 0.05;

  if (priceDiff > priceMargin) {
    console.warn(
      `⚠️ Price mismatch: Shopify=${shopifyPriceNum}, Kinguin=${kinguinPriceNum}`,
    );
    return {
      valid: false,
      reason: `Price mismatch (Shopify: ${shopifyPriceNum}, Kinguin: ${kinguinPriceNum})`,
      item: item.name,
      shopifyPrice: shopifyPriceNum,
      kinguinPrice: kinguinPriceNum,
    };
  }

  console.log(`✅ Price OK: ${kinguinPriceNum}`);

  return {
    valid: true,
    item: item.name,
    stock: stock.available,
    price: priceInfo.price,
  };
}
