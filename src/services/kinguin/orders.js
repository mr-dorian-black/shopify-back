import { kinguin } from "../../config/axios.js";

export async function createKinguinOrder(productId, quantity = 1) {
  try {
    const payload = {
      products: [
        {
          kinguinId: productId,
          qty: quantity,
        },
      ],
    };

    const res = await kinguin.post("/v1/order", payload);
    console.log("✅ Kinguin order created:", res.data.orderId);
    return res.data;
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
    const res = await kinguin.get(`/v1/order/${orderId}/keys`);
    return res.data.keys || [];
  } catch (error) {
    console.error(
      "❌ Failed to get Kinguin keys:",
      error.response?.data || error.message,
    );
    throw error;
  }
}
