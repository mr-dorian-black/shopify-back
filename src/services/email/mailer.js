import nodemailer from "nodemailer";
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} from "../../config/env.js";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST || "smtp.gmail.com",
  port: SMTP_PORT || 587,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendKeyEmail(customerEmail, customerName, keys) {
  const emailHtml = `
    <h2>Thank you for your purchase!</h2>
    <p>Hi ${customerName},</p>
    <p>Here are your activation keys:</p>
    ${keys
      .map(
        (k) => `
      <div style="margin: 20px 0;">
        <strong>${k.productName}</strong>
        <div style="background: #f5f5f5; padding: 15px; margin: 10px 0; font-family: monospace; font-size: 16px;">
          ${k.key}
        </div>
      </div>
    `,
      )
      .join("")}
    <p>You can also find these keys in your account dashboard.</p>
    <p>Best regards,<br>Your Store Team</p>
  `;

  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: customerEmail,
    subject: `Your Game Keys`,
    html: emailHtml,
  });

  console.log(`✅ Email sent to ${customerEmail}`);
}

export async function sendOrderCancellationEmail(
  customerEmail,
  customerName,
  orderName,
  errors,
) {
  const html = `
    <h2>Order Cannot Be Processed</h2>
    <p>Hi ${customerName},</p>
    <p>Unfortunately, we cannot process your order ${orderName} due to the following reasons:</p>
    <ul>
      ${errors.map((e) => `<li><strong>${e.item}:</strong> ${e.reason}</li>`).join("")}
    </ul>
    <p>Your payment has been refunded. We apologize for the inconvenience.</p>
    <p>Best regards,<br>Your Store Team</p>
  `;

  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: customerEmail,
    subject: `Order ${orderName} - Unable to Process`,
    html,
  });
}
