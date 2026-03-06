import express from "express";
import { validateOrderItem } from "../services/kinguin/validation.js";
import {
  createKinguinOrder,
  getKinguinOrderKeys,
} from "../services/kinguin/orders.js";
import {
  cancelShopifyOrder,
  refundOrder,
  addOrderNote,
} from "../services/shopify/orders.js";
import { saveKeyToCustomer } from "../services/shopify/customers.js";
import {
  sendKeyEmail,
  sendOrderCancellationEmail,
} from "../services/email/mailer.js";
import {
  registerWebhook,
  listWebhooks,
  deleteWebhook,
} from "../services/shopify/webhooks.js";

const router = express.Router();

router.post("/orders/create", async (req, res) => {
  try {
    res.status(200).send("OK");
    const order = req.body;
    console.log(JSON.stringify(order, null, 2));
    console.log(`\n🛒 New order received: ${order.id} (${order.name})`);
    console.log(`Customer: ${order.customer?.email}`);

    const orderGid = `gid://shopify/Order/${order.id}`;
    const validationErrors = [];

    console.log("\n🔍 STEP 1: Validating order items...");

    for (const item of order.line_items) {
      const validation = await validateOrderItem(item, item.price);

      if (!validation.valid) {
        validationErrors.push(validation);
        console.error(`❌ Validation failed: ${validation.reason}`);
      } else if (validation.autoUpdated && validation.kinguinPrice) {
        // Price was updated during validation - need to check if customer paid enough
        const customerPaid = parseFloat(item.price);
        const actualCost = parseFloat(validation.kinguinPrice);
        const loss = actualCost - customerPaid;

        if (loss > 0.5) {
          // Customer paid significantly less than actual cost
          validationErrors.push({
            valid: false,
            item: item.name,
            reason: `Price increased after order placement. Customer paid ${customerPaid.toFixed(2)}€, actual cost ${actualCost.toFixed(2)}€. Loss: ${loss.toFixed(2)}€. Cannot fulfill at loss.`,
            shopifyPrice: customerPaid,
            kinguinPrice: actualCost,
          });
          console.error(
            `❌ ${item.name}: Price too high - would lose ${loss.toFixed(2)}€`,
          );
        } else if (loss > 0) {
          console.warn(
            `⚠️ ${item.name}: Small price difference -${loss.toFixed(2)}€ (acceptable)`,
          );
        } else {
          console.log(`✅ ${item.name} validated (price favorable)`);
        }
      } else {
        console.log(`✅ ${item.name} validated successfully`);
      }
    }

    if (validationErrors.length > 0) {
      console.error("\n❌ Order validation failed!");
      console.error("Errors:", validationErrors);

      const errorMessage = validationErrors
        .map((e) => `${e.item}: ${e.reason}`)
        .join("\n");

      try {
        await addOrderNote(
          orderGid,
          `Order validation failed:\n${errorMessage}`,
        );
        await cancelShopifyOrder(orderGid, errorMessage);
        await refundOrder(orderGid);

        if (order.customer?.email) {
          await sendOrderCancellationEmail(
            order.customer.email,
            order.customer.first_name || "Customer",
            order.name,
            validationErrors,
          );
        }

        console.log("✅ Order cancelled and refunded");
        return;
      } catch (error) {
        console.error("❌ Failed to cancel/refund order:", error.message);
        return;
      }
    }

    console.log("\n✅ All items validated, proceeding with fulfillment...");

    const keysToDeliver = [];
    const failedItems = []; // Track failed items
    let expectedKeysCount = 0; // Total keys we should receive

    for (const item of order.line_items) {
      expectedKeysCount += item.quantity; // Track expected total

      try {
        console.log(`\n📦 Processing: ${item.name} (qty: ${item.quantity})`);

        const kinguinProductId = item.sku;

        console.log(
          `🔑 Ordering key from Kinguin (Product ID: ${kinguinProductId})`,
        );

        const kinguinOrder = await createKinguinOrder(
          kinguinProductId,
          item.quantity,
        );

        console.log("kinguinOrder: ", JSON.stringify(kinguinOrder, null, 2));

        await new Promise((r) => setTimeout(r, 2000));

        const keys = await getKinguinOrderKeys(kinguinOrder.orderId);

        console.log("keys: ", JSON.stringify(keys, null, 2));

        if (!keys.length) {
          throw new Error("No keys received from Kinguin");
        }

        // Check if received correct quantity
        if (keys.length !== item.quantity) {
          console.warn(
            `⚠️ Expected ${item.quantity} keys, received ${keys.length}`,
          );
        }

        console.log(`✅ Received ${keys.length} key(s)`);

        for (const keyData of keys) {
          keysToDeliver.push({
            productName: item.name,
            key: keyData.serial || keyData.key,
            kinguinOrderId: kinguinOrder.orderId,
          });
        }
      } catch (error) {
        console.error(`❌ Failed to process ${item.name}:`, error.message);

        // Track failed item
        failedItems.push({
          name: item.name,
          quantity: item.quantity,
          sku: item.sku,
          price: item.price,
          error: error.message,
        });

        await addOrderNote(
          orderGid,
          `❌ Failed to get keys for ${item.name}: ${error.message}`,
        );
      }
    }

    // Check if we got all keys
    if (failedItems.length > 0) {
      console.error(
        `\n❌ CRITICAL: Failed to fulfill ${failedItems.length} items!`,
      );

      const failureMessage = failedItems
        .map((item) => `${item.name} (${item.quantity}x): ${item.error}`)
        .join("\n");

      try {
        // Add comprehensive note about failure
        await addOrderNote(
          orderGid,
          `⚠️ PARTIAL FULFILLMENT FAILURE:\n${failureMessage}\n\nReceived ${keysToDeliver.length}/${expectedKeysCount} keys.\n\nAction required: Manual review needed.`,
        );

        // If NO keys were delivered, cancel the entire order
        if (keysToDeliver.length === 0) {
          console.error("❌ No keys delivered - cancelling order");
          await cancelShopifyOrder(
            orderGid,
            "Failed to obtain any keys from supplier",
          );
          await refundOrder(orderGid);

          if (order.customer?.email) {
            await sendOrderCancellationEmail(
              order.customer.email,
              order.customer.first_name || "Customer",
              order.name,
              failedItems.map((item) => ({
                item: item.name,
                reason: item.error,
              })),
            );
          }

          console.log("✅ Order fully cancelled and refunded");
          return;
        } else {
          // Partial delivery - send what we have but notify about issues
          console.warn(
            `⚠️ Partial delivery: ${keysToDeliver.length}/${expectedKeysCount} keys`,
          );
          await addOrderNote(
            orderGid,
            `⚠️ Partial keys delivered. Customer support review required.`,
          );
        }
      } catch (error) {
        console.error(
          "❌ Failed to handle fulfillment failure:",
          error.message,
        );
      }
    }

    if (keysToDeliver.length > 0 && order.customer) {
      try {
        const customerId = `gid://shopify/Customer/${order.customer.id}`;

        for (const keyInfo of keysToDeliver) {
          await saveKeyToCustomer(
            customerId,
            order.id,
            keyInfo.productName,
            keyInfo.key,
          );
        }

        const customerName =
          order.customer.first_name || order.customer.email.split("@")[0];

        await sendKeyEmail(order.customer.email, customerName, keysToDeliver);

        console.log(`✅ Keys delivered to ${order.customer.email}`);

        const noteText = `Keys delivered:\n${keysToDeliver.map((k) => `${k.productName}: ${k.key}`).join("\n")}`;
        await addOrderNote(orderGid, noteText);

        // If there were failed items, add note to contact support
        if (failedItems.length > 0) {
          await addOrderNote(
            orderGid,
            `⚠️ Customer notified about partial delivery. ${failedItems.length} item(s) failed. Manual refund may be required.`,
          );
        }
      } catch (error) {
        console.error("❌ Failed to deliver keys:", error.message);
        await addOrderNote(
          orderGid,
          `❌ Key delivery failed: ${error.message}. Keys obtained but not sent to customer!`,
        );
      }
    } else if (keysToDeliver.length > 0 && !order.customer) {
      // Keys obtained but no customer to send to
      console.error("❌ Keys obtained but no customer information available!");
      await addOrderNote(
        orderGid,
        `❌ CRITICAL: ${keysToDeliver.length} keys obtained but no customer info to deliver. Manual intervention required.`,
      );
    } else if (keysToDeliver.length === 0) {
      console.error("❌ No keys to deliver - already handled above");
    }

    console.log(`✅ Order ${order.name} processed successfully`);
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
  }
});

// Orders cancelled webhook
router.post("/orders/cancelled", async (req, res) => {
  try {
    res.status(200).send("OK");

    const order = req.body;
    console.log(`\n🚫 Order cancelled: ${order.id} (${order.name})`);
    console.log(`Reason: ${order.cancel_reason || "Not specified"}`);

    const orderGid = `gid://shopify/Order/${order.id}`;

    // Log cancellation for tracking
    await addOrderNote(
      orderGid,
      `Order cancelled via webhook. Reason: ${order.cancel_reason || "Not specified"}`,
    );

    // TODO: Implement logic to handle Kinguin order cancellation if needed
    // For example, request refund from Kinguin or deactivate keys

    console.log(`✅ Order cancellation processed: ${order.name}`);
  } catch (error) {
    console.error("❌ Order cancellation webhook error:", error);
  }
});

// Refunds create webhook
router.post("/refunds/create", async (req, res) => {
  try {
    res.status(200).send("OK");

    const refund = req.body;
    console.log(`\n💰 Refund created for order: ${refund.order_id}`);
    console.log(
      `Refund amount: ${refund.transactions?.[0]?.amount} ${refund.transactions?.[0]?.currency}`,
    );

    const orderGid = `gid://shopify/Order/${refund.order_id}`;

    // Log refund
    const refundAmount = refund.transactions?.[0]?.amount || 0;
    await addOrderNote(
      orderGid,
      `Refund processed: ${refundAmount} ${refund.transactions?.[0]?.currency || "USD"}`,
    );

    // TODO: Implement logic to handle keys deactivation
    // Mark keys as refunded/invalid in your system

    console.log(`✅ Refund processed for order ${refund.order_id}`);
  } catch (error) {
    console.error("❌ Refund webhook error:", error);
  }
});

router.post("/register", async (req, res) => {
  try {
    const baseUrl = req.body.baseUrl || `https://your-domain.com`;
    const topic = req.body.topic || "ORDERS_CREATE";

    // Map topics to endpoints
    const topicEndpoints = {
      ORDERS_CREATE: "/webhooks/orders/create",
      ORDERS_CANCELLED: "/webhooks/orders/cancelled",
      REFUNDS_CREATE: "/webhooks/refunds/create",
      PRODUCTS_UPDATE: "/webhooks/products/update",
    };

    const endpoint = topicEndpoints[topic];
    if (!endpoint) {
      return res.status(400).json({
        ok: false,
        error: `Unknown topic: ${topic}. Available: ${Object.keys(topicEndpoints).join(", ")}`,
      });
    }

    const webhookUrl = `${baseUrl}${endpoint}`;
    const webhook = await registerWebhook(topic, webhookUrl);

    res.json({
      ok: true,
      webhook,
      url: webhookUrl,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

// Register all webhooks at once
router.post("/register-all", async (req, res) => {
  try {
    const baseUrl = req.body.baseUrl;

    if (!baseUrl) {
      return res.status(400).json({
        ok: false,
        error: "baseUrl is required (e.g., https://your-domain.com)",
      });
    }

    const topics = [
      "ORDERS_CREATE",
      "ORDERS_CANCELLED",
      "REFUNDS_CREATE",
      "PRODUCTS_UPDATE",
    ];

    const results = [];

    for (const topic of topics) {
      try {
        const topicEndpoints = {
          ORDERS_CREATE: "/webhooks/orders/create",
          ORDERS_CANCELLED: "/webhooks/orders/cancelled",
          REFUNDS_CREATE: "/webhooks/refunds/create",
          PRODUCTS_UPDATE: "/webhooks/products/update",
        };

        const webhookUrl = `${baseUrl}${topicEndpoints[topic]}`;
        const webhook = await registerWebhook(topic, webhookUrl);

        results.push({
          topic,
          url: webhookUrl,
          success: true,
          webhook,
        });

        console.log(`✅ Registered ${topic}`);
      } catch (error) {
        results.push({
          topic,
          success: false,
          error: error.message,
        });

        console.error(`❌ Failed to register ${topic}:`, error.message);
      }
    }

    const successCount = results.filter((r) => r.success).length;

    res.json({
      ok: true,
      message: `Registered ${successCount}/${topics.length} webhooks`,
      results,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

router.get("/list", async (req, res) => {
  try {
    const webhooks = await listWebhooks();

    res.json({
      ok: true,
      count: webhooks.length,
      webhooks,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    const webhookId = req.params.id;

    if (!webhookId) {
      return res.status(400).json({
        ok: false,
        error: "Webhook ID is required",
      });
    }

    const deletedId = await deleteWebhook(webhookId);

    res.json({
      ok: true,
      message: "Webhook deleted successfully",
      deletedId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

export default router;
