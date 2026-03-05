import { shopifyGraphQL } from "../../config/axios.js";

// Available webhook topics
export const WEBHOOK_TOPICS = {
  ORDERS_CREATE: "ORDERS_CREATE",
  ORDERS_CANCELLED: "ORDERS_CANCELLED",
  REFUNDS_CREATE: "REFUNDS_CREATE",
  PRODUCTS_UPDATE: "PRODUCTS_UPDATE",
};

export async function registerWebhook(topic, callbackUrl) {
  // Validate topic
  if (!Object.values(WEBHOOK_TOPICS).includes(topic)) {
    throw new Error(
      `Invalid webhook topic: ${topic}. Must be one of: ${Object.keys(WEBHOOK_TOPICS).join(", ")}`,
    );
  }

  const mutation = `
    mutation {
      webhookSubscriptionCreate(topic: ${topic}, webhookSubscription: {
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

export async function deleteWebhook(webhookId) {
  const mutation = `
    mutation {
      webhookSubscriptionDelete(id: "${webhookId}") {
        deletedWebhookSubscriptionId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await shopifyGraphQL.post("", { query: mutation });

  if (response.data.data?.webhookSubscriptionDelete?.userErrors?.length) {
    throw new Error(
      JSON.stringify(response.data.data.webhookSubscriptionDelete.userErrors),
    );
  }

  return response.data.data.webhookSubscriptionDelete
    .deletedWebhookSubscriptionId;
}
