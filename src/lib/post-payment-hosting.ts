import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import {
  isPleskConfiguredAsync,
  findCustomerByEmail,
  createCustomer,
  createSubscription,
} from "@/lib/plesk";
import { sendEmail, hostingCredentialsTemplate } from "@/lib/email";

/**
 * After a payment completes, check if it's linked to a hosting order
 * and automatically provision on Plesk + email login credentials.
 */
export async function handlePostPaymentHosting(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.status !== "COMPLETE") return;

  // Check metadata for hosting order ID
  let hostingOrderId: string | null = null;
  if (payment.metadata) {
    try {
      const meta = JSON.parse(payment.metadata);
      hostingOrderId = meta.hostingOrderId || meta.hosting_order_id || null;
    } catch {
      // Not JSON or no order ID
    }
  }

  // Also try matching by invoice number
  if (!hostingOrderId && payment.invoiceNumber) {
    const order = await prisma.hostingOrder.findFirst({
      where: {
        invoiceNinjaInvoiceId: payment.invoiceNumber,
        orderType: { in: ["HOSTING", "ADDITIONAL_HOSTING"] },
      },
    });
    if (order) hostingOrderId = order.id;
  }

  if (!hostingOrderId) return;

  const order = await prisma.hostingOrder.findUnique({
    where: { id: hostingOrderId },
    include: {
      product: true,
      user: true,
    },
  });

  if (!order) return;
  if (!["HOSTING", "ADDITIONAL_HOSTING"].includes(order.orderType)) return;

  // Skip if already provisioned or active
  if (["ACTIVE", "PROVISIONING"].includes(order.status) && order.pleskSubscriptionId) return;

  // Update order status to PAID
  await prisma.hostingOrder.update({
    where: { id: hostingOrderId },
    data: { status: "PAID" },
  });

  // Check if Plesk is configured
  const pleskReady = await isPleskConfiguredAsync();
  if (!pleskReady || !order.domain || !order.product?.pleskPlanName) {
    // Mark as provisioning for manual completion
    await prisma.hostingOrder.update({
      where: { id: hostingOrderId },
      data: { status: "PROVISIONING" },
    });
    console.log(
      `Hosting order ${hostingOrderId} paid but Plesk not configured or missing domain/plan. Requires manual provisioning.`
    );
    return;
  }

  try {
    // Find or create Plesk customer
    let pleskCustomer = await findCustomerByEmail(order.user.email);
    const customerPassword = randomBytes(10).toString("base64url");
    const customerLogin = order.user.email
      .split("@")[0]
      .replace(/[^a-z0-9_-]/gi, "")
      .substring(0, 16);

    if (!pleskCustomer) {
      pleskCustomer = await createCustomer({
        name: `${order.user.firstName} ${order.user.lastName}`,
        login: customerLogin,
        password: customerPassword,
        email: order.user.email,
        company: order.user.company || undefined,
      });
    }

    // Generate FTP/hosting credentials
    const ftpLogin = order.domain.replace(/\./g, "_").substring(0, 16);
    const ftpPassword = randomBytes(10).toString("base64url");

    // Create subscription with explicit credentials
    const subscription = await createSubscription({
      customerId: pleskCustomer.id,
      domain: order.domain,
      planName: order.product.pleskPlanName,
      login: ftpLogin,
      password: ftpPassword,
    });

    // Mark order as active
    await prisma.hostingOrder.update({
      where: { id: hostingOrderId },
      data: {
        pleskSubscriptionId: String(subscription.id),
        status: "ACTIVE",
        provisionedAt: new Date(),
      },
    });

    // Send credentials email to user
    const userName = `${order.user.firstName} ${order.user.lastName}`.trim() || order.user.email;
    const html = hostingCredentialsTemplate({
      recipientName: userName,
      domain: order.domain,
      planName: order.product.name || order.product.pleskPlanName,
      pleskLogin: pleskCustomer.login || customerLogin,
      pleskPassword: customerPassword,
      ftpLogin,
      ftpPassword,
    });

    await sendEmail({
      to: order.user.email,
      subject: `Your Hosting Account is Ready — ${order.domain}`,
      html,
    });

    console.log(
      `Hosting provisioned and credentials emailed after payment: ${order.domain} (order ${hostingOrderId})`
    );
  } catch (error) {
    console.error("Failed to auto-provision hosting after payment:", error);
    await prisma.hostingOrder.update({
      where: { id: hostingOrderId },
      data: { status: "FAILED" },
    });
  }
}
