import { kinguin } from "../../config/axios.js";

export async function createKinguinOrder(productId, quantity = 1, price) {
  try {
    console.log(
      `📊 Creating order for product: ${productId} (qty: ${quantity})`,
    );

    // Create order using API v2 (official documentation)
    const payload = {
      products: [
        {
          productId: productId,
          qty: quantity,
          price: parseFloat(price),
        },
      ],
    };

    const orderRes = await kinguin.post("/v2/order", payload);
    const orderId = orderRes.data.orderId;
    console.log("✅ Kinguin order created:", orderId);

    return orderRes.data;
  } catch (error) {
    console.error(
      "❌ Failed to create Kinguin order:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

export async function getKinguinOrderKeys(orderId) {
  try {
    // Wait a bit for order to be processed
    console.log(`⏳ Waiting for order to be processed: ${orderId}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Try to get keys with a few retries
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(
        `📥 Fetching keys (attempt ${attempt}/${maxRetries}): ${orderId}`,
      );

      try {
        const res = await kinguin.get(`/v2/order/${orderId}/keys`);
        const keys = res.data || [];

        if (keys.length > 0) {
          console.log(`✅ Keys received (${keys.length})`);
          return keys;
        }

        console.log(`⏳ No keys yet, waiting 3 more seconds...`);
      } catch (err) {
        console.log(`⚠️ Attempt ${attempt} failed:`, err.message);
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // If still no keys, throw error
    throw new Error(
      `No keys delivered after ${maxRetries} attempts (${maxRetries * 3}s). Order may still be processing.`,
    );
  } catch (error) {
    console.error(
      "❌ Failed to get order keys:",
      error.response?.data || error.message,
    );
    throw error;
  }
}
