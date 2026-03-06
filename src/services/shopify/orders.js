import { shopifyGraphQL } from "../../config/axios.js";

export async function cancelShopifyOrder(orderId, reason) {
  const mutation = `
    mutation {
      orderCancel(orderId: "${orderId}", reason: OTHER, notifyCustomer: true, staffNote: ${JSON.stringify(reason)}) {
        order {
          id
          cancelledAt
          cancelReason
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await shopifyGraphQL.post("", { query: mutation });

  if (response.data.data?.orderCancel?.userErrors?.length) {
    console.error(
      "❌ Failed to cancel order:",
      response.data.data.orderCancel.userErrors,
    );
    throw new Error("Failed to cancel order");
  }

  console.log(`✅ Order ${orderId} cancelled`);
}

export async function refundOrder(orderId) {
  const query = `
    query {
      order(id: "${orderId}") {
        id
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        transactions {
          id
          kind
          status
        }
      }
    }
  `;

  const orderResponse = await shopifyGraphQL.post("", { query });
  const order = orderResponse.data.data.order;

  const payment = order.transactions.find(
    (t) => t.kind === "SALE" && t.status === "SUCCESS",
  );

  if (!payment) {
    console.warn("⚠️ No payment to refund");
    return;
  }

  const mutation = `
    mutation {
      refundCreate(input: {
        orderId: "${orderId}",
        note: "Out of stock or price mismatch",
        notify: true,
        refundLineItems: [],
        transactions: [{
          parentId: "${payment.id}",
          amount: "${order.totalPriceSet.shopMoney.amount}",
          kind: REFUND
        }]
      }) {
        refund {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await shopifyGraphQL.post("", { query: mutation });

  if (response.data.data?.refundCreate?.userErrors?.length) {
    console.error(
      "❌ Failed to refund:",
      response.data.data.refundCreate.userErrors,
    );
    throw new Error("Failed to refund order");
  }

  console.log(`✅ Order ${orderId} refunded`);
}

export async function addOrderNote(orderId, note) {
  const mutation = `
    mutation {
      orderUpdate(input: {
        id: "${orderId}",
        note: ${JSON.stringify(note)}
      }) {
        order {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  await shopifyGraphQL.post("", { query: mutation });
}

export async function saveKeysToOrder(orderId, keys) {
  try {
    // Save keys as order metafield so customer can see them in their account
    const keysData = keys.map((k) => ({
      product: k.productName,
      key: k.key,
      image: k.image,
    }));

    const mutation = `
      mutation {
        orderUpdate(input: {
          id: "${orderId}",
          metafields: [{
            namespace: "game_keys",
            key: "delivered_keys",
            type: "json",
            value: ${JSON.stringify(JSON.stringify(keysData))}
          }]
        }) {
          order {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await shopifyGraphQL.post("", { query: mutation });

    if (response.data.data?.orderUpdate?.userErrors?.length) {
      console.error(
        "❌ Failed to save keys to order:",
        response.data.data.orderUpdate.userErrors,
      );
      throw new Error("Failed to save keys to order metafield");
    }

    console.log(`✅ Keys saved to order ${orderId} metafields`);
  } catch (error) {
    console.error("❌ Error saving keys to order:", error.message);
    throw error;
  }
}

export async function fulfillOrder(orderId) {
  try {
    // Step 1: Get fulfillment orders
    const query = `
      query {
        order(id: "${orderId}") {
          id
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                status
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      remainingQuantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const orderResponse = await shopifyGraphQL.post("", { query });
    const fulfillmentOrders =
      orderResponse.data.data?.order?.fulfillmentOrders?.edges || [];

    if (!fulfillmentOrders.length) {
      throw new Error("No fulfillment orders found");
    }

    // Get the first open fulfillment order
    const openFulfillmentOrder = fulfillmentOrders.find(
      (edge) => edge.node.status === "OPEN",
    );

    if (!openFulfillmentOrder) {
      console.warn(
        "⚠️ No open fulfillment orders - order may already be fulfilled",
      );
      return null;
    }

    const fulfillmentOrderId = openFulfillmentOrder.node.id;

    // Collect all line items with their quantities
    const lineItems = openFulfillmentOrder.node.lineItems.edges
      .filter((edge) => edge.node.remainingQuantity > 0)
      .map((edge) => ({
        id: edge.node.id,
        quantity: edge.node.remainingQuantity,
      }));

    if (lineItems.length === 0) {
      console.warn("⚠️ No line items with remaining quantity to fulfill");
      return null;
    }

    console.log(`📦 Fulfilling ${lineItems.length} line item(s)...`);

    // Step 2: Create fulfillment
    const mutation = `
      mutation {
        fulfillmentCreateV2(fulfillment: {
          notifyCustomer: true,
          lineItemsByFulfillmentOrder: [{
            fulfillmentOrderId: "${fulfillmentOrderId}",
            fulfillmentOrderLineItems: [
              ${lineItems.map((item) => `{ id: "${item.id}", quantity: ${item.quantity} }`).join(", ")}
            ]
          }]
        }) {
          fulfillment {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await shopifyGraphQL.post("", { query: mutation });

    if (response.data.data?.fulfillmentCreateV2?.userErrors?.length) {
      console.error(
        "❌ Failed to fulfill order:",
        response.data.data.fulfillmentCreateV2.userErrors,
      );
      throw new Error(
        response.data.data.fulfillmentCreateV2.userErrors[0].message,
      );
    }

    console.log(`✅ Order ${orderId} fulfilled`);
    return response.data.data.fulfillmentCreateV2.fulfillment;
  } catch (error) {
    console.error("❌ Fulfillment error:", error.message);
    throw error;
  }
}
