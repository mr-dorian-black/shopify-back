import "dotenv/config";
import app from "./src/app.js";
import { getAdminToken } from "./src/services/shopify/auth.js";

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log(`🔥 Server running on port ${PORT}`);

  // Initialize Shopify token on startup
  try {
    await getAdminToken();
    console.log("✅ Shopify authentication initialized");
  } catch (error) {
    console.error("❌ Failed to initialize Shopify auth:", error.message);
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("❌ Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
