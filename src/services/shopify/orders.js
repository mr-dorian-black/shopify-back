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
