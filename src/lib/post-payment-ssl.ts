import prisma from "@/lib/prisma";
import { orderCertificate } from "@/lib/digicert";

/**
 * After a payment completes, check if it's linked to an SSL order
 * and automatically issue the certificate to DigiCert.
 */
export async function handlePostPaymentSsl(paymentId: string) {
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
        orderType: "SSL",
      },
    });
    if (order) hostingOrderId = order.id;
  }

  if (!hostingOrderId) return;

  const order = await prisma.hostingOrder.findUnique({
    where: { id: hostingOrderId },
    include: { sslCertificate: true },
  });

  if (!order || order.orderType !== "SSL") return;
  if (!order.sslCertificate) return;

  const cert = order.sslCertificate;

  // Only issue if not already submitted
  if (cert.digicertOrderId) return;
  if (!cert.csr) return; // CSR required - admin will need to issue manually

  // Update order status to PAID
  await prisma.hostingOrder.update({
    where: { id: hostingOrderId },
    data: { status: "PAID" },
  });

  // Determine product ID
  const productMap: Record<string, string> = {
    DV: "ssl_dv_geotrust",
    WILDCARD: "wildcard_dv_geotrust",
    OV: "ssl_basic",
    EV: "ssl_ev_basic",
  };
  const productId = productMap[cert.productType] || "ssl_dv_geotrust";

  try {
    const sans = cert.sans ? JSON.parse(cert.sans) : [];
    const dcResult = await orderCertificate({
      productId,
      commonName: cert.commonName,
      csr: cert.csr,
      validityYears: 1,
      sans,
      dcvMethod: cert.validationType === "EMAIL" ? "email" : "dns-txt-token",
    });

    await prisma.sslCertificate.update({
      where: { id: cert.id },
      data: {
        digicertOrderId: dcResult.id,
        status: "PENDING_VALIDATION",
        validationDetails: JSON.stringify(dcResult),
      },
    });

    await prisma.hostingOrder.update({
      where: { id: hostingOrderId },
      data: { status: "PROVISIONING" },
    });

    console.log(`SSL certificate issued to DigiCert after payment: order #${dcResult.id} for ${cert.commonName}`);
  } catch (error) {
    console.error("Failed to auto-issue SSL certificate after payment:", error);
    // Don't throw - payment was still successful
  }
}
