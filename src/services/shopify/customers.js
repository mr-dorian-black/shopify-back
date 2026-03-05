import { shopifyGraphQL } from "../../config/axios.js";

export async function saveKeyToCustomer(customerId, orderId, productName, key) {
  const mutation = `
    mutation {
      customerUpdate(input: {
        id: "${customerId}",
        metafields: [{
          namespace: "purchased_keys",
          key: "order_${orderId}",
          type: "json",
          value: ${JSON.stringify(
            JSON.stringify({
              productName,
              key,
              purchasedAt: new Date().toISOString(),
            }),
          )}
        }]
      }) {
        customer {
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

  if (response.data.data?.customerUpdate?.userErrors?.length) {
    console.error(
      "❌ Failed to save key to customer:",
      response.data.data.customerUpdate.userErrors,
    );
    throw new Error("Failed to save key to customer metafield");
  }

  console.log(`✅ Key saved to customer ${customerId}`);
}
