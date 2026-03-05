import { shopifyGraphQL } from "../../config/axios.js";

export async function registerWebhook(callbackUrl) {
  const mutation = `
    mutation {
      webhookSubscriptionCreate(topic: ORDERS_CREATE, webhookSubscription: {
        format: JSON,
        callbackUrl: "${callbackUrl}"
      }) {
        webhookSubscription {
          id
          topic
          callbackUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await shopifyGraphQL.post("", { query: mutation });

  if (response.data.data?.webhookSubscriptionCreate?.userErrors?.length) {
    throw new Error(
      JSON.stringify(response.data.data.webhookSubscriptionCreate.userErrors),
    );
  }

  return response.data.data.webhookSubscriptionCreate.webhookSubscription;
}

export async function listWebhooks() {
  const query = `
    query {
      webhookSubscriptions(first: 50) {
        edges {
          node {
            id
            topic
            callbackUrl
            format
          }
        }
      }
    }
  `;

  const response = await shopifyGraphQL.post("", { query });
  return response.data.data.webhookSubscriptions.edges.map((e) => e.node);
}
