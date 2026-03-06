import axios from "axios";
import {
  BREVO_API_KEY,
  BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME,
  LOGO_URL,
} from "../../config/env.js";

const brevoClient = axios.create({
  baseURL: "https://api.brevo.com/v3",
  headers: {
    accept: "application/json",
    "api-key": BREVO_API_KEY,
    "content-type": "application/json",
  },
  timeout: 30000,
});

// Error interceptor for Brevo API
brevoClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ECONNABORTED") {
      console.error("❌ Brevo API timeout:", error.config?.url);
    } else if (error.response) {
      console.error(
        "❌ Brevo API error:",
        error.response.status,
        error.response.data,
      );
    } else {
      console.error("❌ Brevo API network error:", error.message);
    }
    return Promise.reject(error);
  },
);

export async function sendKeyEmail(
  customerEmail,
  customerName,
  keys,
  orderNumber = null,
) {
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #020618;
        }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #020618;
        }
        .header {
          background: #0a0f2e;
          padding: 40px 20px;
          text-align: center;
        }
        .header h1 {
          color: #FFFFFF;
          margin: 0;
          font-size: 28px;
          font-weight: 600;
        }
        .header p {
          color: #F3F3F3;
          margin: 10px 0 0 0;
          font-size: 14px;
        }
        .logo {
          max-width: 200px;
          height: auto;
          margin-bottom: 20px;
        }
        .content {
          padding: 30px 20px;
          background-color: #020618;
        }
        .greeting {
          font-size: 18px;
          color: #F3F3F3;
          margin-bottom: 20px;
        }
        .intro-text {
          color: #F3F3F3;
          line-height: 1.6;
          margin-bottom: 30px;
        }
        .game-item {
          background: #0a0f2e;
          border-radius: 12px;
          margin-bottom: 25px;
          overflow: hidden;
          border: 1px solid #1a1f3e;
        }
        .game-header {
          display: flex;
          align-items: center;
          padding: 15px;
          background: #0d1229;
          border-bottom: 2px solid #4F39F6;
        }
        .game-image {
          width: 80px;
          height: 80px;
          object-fit: cover;
          border-radius: 8px;
          margin-right: 15px;
          border: 2px solid #1a1f3e;
        }
        .game-image-placeholder {
          width: 80px;
          height: 80px;
          background: #020618;
          border-radius: 8px;
          margin-right: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          font-size: 32px;
          font-weight: bold;
        }
        .game-info {
          flex: 1;
        }
        .game-title {
          font-size: 16px;
          font-weight: 600;
          color: #F3F3F3;
          margin: 0 0 5px 0;
        }
        .game-price {
          font-size: 18px;
          color: #00B8DB;
          font-weight: 600;
        }
        .key-container {
          padding: 20px;
        }
        .key-label {
          font-size: 12px;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
          font-weight: 600;
        }
        .key-box {
          background: #0d1229;
          border: 2px dashed #4F39F6;
          border-radius: 8px;
          padding: 15px 20px;
          font-family: 'Courier New', monospace;
          font-size: 16px;
          color: #F3F3F3;
          text-align: center;
          letter-spacing: 1px;
          word-break: break-all;
        }
        .copy-hint {
          font-size: 11px;
          color: #9ca3af;
          text-align: center;
          margin-top: 8px;
        }
        .footer-info {
          background: #0a0f2e;
          padding: 20px;
          border-radius: 8px;
          margin-top: 30px;
          border: 1px solid #1a1f3e;
        }
        .footer-info p {
          margin: 8px 0;
          color: #F3F3F3;
          font-size: 14px;
          line-height: 1.6;
        }
        .footer {
          background: #0d1229;
          color: #9ca3af;
          padding: 30px 20px;
          text-align: center;
          font-size: 13px;
          line-height: 1.6;
        }
        .footer a {
          color: #4F39F6;
          text-decoration: none;
        }
        .divider {
          height: 1px;
          background: linear-gradient(to right, transparent, #1a1f3e, transparent);
          margin: 25px 0;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          ${LOGO_URL ? `<img src="${LOGO_URL}" alt="Logo" class="logo">` : ""}
          <h1>🎮 Your Game Keys Are Ready!</h1>
          ${orderNumber ? `<p>Order ${orderNumber}</p>` : ""}
        </div>

        <!-- Content -->
        <div class="content">
          <div class="greeting">
            Hi ${customerName}! 👋
          </div>

          <div class="intro-text">
            Thank you for your purchase! Your game keys have been successfully generated and are ready to use. 
            ${keys.length > 1 ? `You received ${keys.length} game keys.` : ""}
          </div>

          <!-- Game Keys -->
          ${keys
            .map(
              (k) => `
            <div class="game-item">
              <div class="game-header">
                ${
                  k.image
                    ? `<img src="${k.image}" alt="${k.productName}" class="game-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                    : ""
                }
                <div class="game-image-placeholder" style="${k.image ? "display:none;" : ""}">🎮</div>
                <div class="game-info">
                  <div class="game-title">${k.productName}</div>
                  ${k.price ? `<div class="game-price">€${parseFloat(k.price).toFixed(2)}</div>` : ""}
                </div>
              </div>
              <div class="key-container">
                <div class="key-label">Your Activation Key</div>
                <div class="key-box">${k.key}</div>
                <div class="copy-hint">Click to select and copy</div>
              </div>
            </div>
          `,
            )
            .join("")}

          <div class="divider"></div>

          <!-- Footer Info -->
          <div class="footer-info">
            <p><strong>📌 How to activate:</strong></p>
            <p>1. Copy your activation key above</p>
            <p>2. Open your game platform (Steam, Epic, etc.)</p>
            <p>3. Go to "Activate a Product" or "Redeem Code"</p>
            <p>4. Paste your key and enjoy your game!</p>
          </div>

          <div class="footer-info" style="margin-top: 15px;">
            <p><strong>💡 Important:</strong></p>
            <p>• Keep your keys safe - they can only be used once</p>
            <p>• Keys are also saved in your account dashboard</p>
            <p>• Contact support if you have any issues</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await brevoClient.post("/smtp/email", {
      sender: {
        name: BREVO_SENDER_NAME || "Game Store",
        email: BREVO_SENDER_EMAIL,
      },
      to: [
        {
          email: customerEmail,
          name: customerName,
        },
      ],
      subject: `🎮 Your Game Keys - ${keys.length} ${keys.length === 1 ? "Game" : "Games"}`,
      htmlContent: emailHtml,
    });

    console.log(`✅ Email sent to ${customerEmail} via Brevo`);
  } catch (error) {
    console.error(
      `❌ Failed to send email to ${customerEmail}:`,
      error.message,
    );
    throw error;
  }
}

export async function sendOrderCancellationEmail(
  customerEmail,
  customerName,
  orderName,
  errors,
) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f4f4f4;
        }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
        }
        .header {
          background: #dc2626;
          padding: 40px 20px;
          text-align: center;
        }
        .header h1 {
          color: #FFFFFF;
          margin: 0;
          font-size: 28px;
          font-weight: 600;
        }
        .header p {
          color: #F3F3F3;
          margin: 10px 0 0 0;
          font-size: 14px;
        }
        .content {
          padding: 30px 20px;
          background-color: #020618;
        }
        .greeting {
          font-size: 18px;
          color: #F3F3F3;
          margin-bottom: 20px;
        }
        .intro-text {
          color: #F3F3F3;
          line-height: 1.6;
          margin-bottom: 25px;
        }
        .error-box {
          background: #1a0f0f;
          border-left: 4px solid #ef4444;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .error-title {
          font-size: 14px;
          font-weight: 600;
          color: #fca5a5;
          margin-bottom: 15px;
        }
        .error-item {
          color: #F3F3F3;
          margin: 10px 0;
          padding-left: 10px;
          line-height: 1.6;
        }
        .error-item strong {
          color: #fca5a5;
        }
        .refund-notice {
          background: #10b981;
          color: #FFFFFF;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 25px 0;
        }
        .refund-notice strong {
          font-size: 18px;
          display: block;
          margin-bottom: 8px;
        }
        .footer-info {
          background: #0a0f2e;
          padding: 20px;
          border-radius: 8px;
          margin-top: 25px;
          border: 1px solid #1a1f3e;
        }
        .footer-info p {
          margin: 8px 0;
          color: #F3F3F3;
          font-size: 14px;
          line-height: 1.6;
        }
        .footer {
          background: #0d1229;
          color: #9ca3af;
          padding: 30px 20px;
          text-align: center;
          font-size: 13px;
          line-height: 1.6;
        }
        .footer a {
          color: #4F39F6;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          ${LOGO_URL ? `<img src="${LOGO_URL}" alt="Logo" class="logo" style="max-width: 200px; height: auto; margin-bottom: 20px;">` : ""}
          <h1>Order Cannot Be Processed</h1>
          <p>Order ${orderName}</p>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="greeting">
            Hi ${customerName},
          </div>

          <div class="intro-text">
            We're sorry, but we cannot process your order <strong>${orderName}</strong> due to the following reasons:
          </div>

          <!-- Errors -->
          <div class="error-box">
            <div class="error-title">Issues Found:</div>
            ${errors.map((e) => `<div class="error-item"><strong>${e.item}:</strong> ${e.reason}</div>`).join("")}
          </div>

          <!-- Refund Notice -->
          <div class="refund-notice">
            <strong>✅ Payment Refunded</strong>
            <div>Your payment has been fully refunded and should appear in your account within 3-5 business days.</div>
          </div>

          <!-- Footer Info -->
          <div class="footer-info">
            <p><strong>What happens next?</strong></p>
            <p>• Your payment is automatically refunded</p>
            <p>• No further action required from you</p>
            <p>• Feel free to browse our store for available items</p>
          </div>

          <div class="intro-text" style="margin-top: 25px;">
            We apologize for any inconvenience. If you have any questions, please don't hesitate to contact our support team.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await brevoClient.post("/smtp/email", {
      sender: {
        name: BREVO_SENDER_NAME || "Game Store",
        email: BREVO_SENDER_EMAIL,
      },
      to: [
        {
          email: customerEmail,
          name: customerName,
        },
      ],
      subject: `Order ${orderName} - Unable to Process`,
      htmlContent: html,
    });

    console.log(`✅ Cancellation email sent to ${customerEmail} via Brevo`);
  } catch (error) {
    console.error(
      `❌ Failed to send cancellation email to ${customerEmail}:`,
      error.message,
    );
    throw error;
  }
}
