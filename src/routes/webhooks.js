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
import { registerWebhook, listWebhooks } from "../services/shopify/webhooks.js";

const router = express.Router();

router.post("/orders/create", async (req, res) => {
  try {
    res.status(200).send("OK");

    const order = req.body;
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

    for (const item of order.line_items) {
      try {
        console.log(`\n📦 Processing: ${item.name}`);

        const kinguinProductId = item.sku;

        console.log(
          `🔑 Ordering key from Kinguin (Product ID: ${kinguinProductId})`,
        );
        const kinguinOrder = await createKinguinOrder(
          kinguinProductId,
          item.quantity,
        );

        await new Promise((r) => setTimeout(r, 2000));

        const keys = await getKinguinOrderKeys(kinguinOrder.orderId);

        if (!keys.length) {
          throw new Error("No keys received from Kinguin");
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
        await addOrderNote(
          orderGid,
          `Failed to get keys for ${item.name}: ${error.message}`,
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
      } catch (error) {
        console.error("❌ Failed to deliver keys:", error.message);
      }
    }

    console.log(`✅ Order ${order.name} processed successfully`);
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
  }
});

router.post("/register", async (req, res) => {
  try {
    const webhookUrl =
      req.body.url || `https://your-domain.com/webhooks/orders/create`;
    const webhook = await registerWebhook(webhookUrl);

    res.json({
      ok: true,
      webhook,
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

export default router;
