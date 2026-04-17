import prisma from "@/lib/prisma";
import { registerDomain, transferDomain } from "@/lib/domains-api";

/**
 * After a payment completes, check if it's linked to a domain order
 * and automatically register or transfer the domain via domains.co.za API.
 */
export async function handlePostPaymentDomain(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment || payment.status !== "COMPLETE") return;

  // Check metadata for domain order ID
  let domainOrderId: string | null = null;
  if (payment.metadata) {
    try {
      const meta = JSON.parse(payment.metadata);
      domainOrderId = meta.domainOrderId || meta.domain_order_id || null;
    } catch {
      // Not JSON or no order ID
    }
  }

  if (!domainOrderId) return;

  const order = await prisma.hostingOrder.findUnique({
    where: { id: domainOrderId },
    include: {
      user: true,
    },
  });

  if (!order) return;
  if (!["DOMAIN_REGISTER", "DOMAIN_TRANSFER"].includes(order.orderType)) return;
  if (["ACTIVE", "PROVISIONING"].includes(order.status)) return;

  // Update order to PAID
  await prisma.hostingOrder.update({
    where: { id: domainOrderId },
    data: { status: "PAID" },
  });

  if (!order.domain) {
    await prisma.hostingOrder.update({
      where: { id: domainOrderId },
      data: { status: "FAILED" },
    });
    console.error(`Domain order ${domainOrderId} has no domain name`);
    return;
  }

  // Split domain into SLD and TLD
  const domainName = order.domain;
  const { sld, tld } = splitDomain(domainName);

  if (!sld || !tld) {
    await prisma.hostingOrder.update({
      where: { id: domainOrderId },
      data: { status: "FAILED" },
    });
    console.error(`Cannot parse domain: ${domainName}`);
    return;
  }

  const userName =
    `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() ||
    order.user.email;
  const userEmail = order.user.email;
  const userPhone = order.user.phoneNumber || "0000000000";
  const userAddress = order.user.companyAddress || "Address not provided";
  const userCity = "Johannesburg";

  try {
    if (order.orderType === "DOMAIN_REGISTER") {
      // Register domain
      await prisma.hostingOrder.update({
        where: { id: domainOrderId },
        data: { status: "PROVISIONING" },
      });

      const result = await registerDomain({
        sld,
        tld,
        registrantName: userName,
        registrantEmail: userEmail,
        registrantContactNumber: userPhone,
        registrantAddress1: userAddress,
        registrantCity: userCity,
      });

      if (result.success || result.queued) {
        // Calculate expiry (1 year from now)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        await prisma.hostingOrder.update({
          where: { id: domainOrderId },
          data: {
            status: "ACTIVE",
            provisionedAt: new Date(),
            expiryDate,
          },
        });
        console.log(
          `Domain registered after payment: ${domainName} (order ${domainOrderId})`
        );
      } else {
        await prisma.hostingOrder.update({
          where: { id: domainOrderId },
          data: { status: "FAILED" },
        });
        console.error(
          `Domain registration failed for ${domainName}: ${result.message}`
        );
      }
    } else if (order.orderType === "DOMAIN_TRANSFER") {
      // Transfer domain
      await prisma.hostingOrder.update({
        where: { id: domainOrderId },
        data: { status: "PROVISIONING" },
      });

      // Get EPP key from notes if available
      let eppKey: string | undefined;
      if (order.notes) {
        const match = order.notes.match(/EPP Key:\s*(.+)/i);
        if (match) eppKey = match[1].trim();
      }

      const result = await transferDomain({
        sld,
        tld,
        eppKey,
        registrantName: userName,
        registrantEmail: userEmail,
        registrantContactNumber: userPhone,
        registrantAddress1: userAddress,
        registrantCity: userCity,
      });

      if (result.success || result.queued) {
        await prisma.hostingOrder.update({
          where: { id: domainOrderId },
          data: {
            status: "PROVISIONING", // Keep as provisioning — transfers take time
            provisionedAt: new Date(),
          },
        });
        console.log(
          `Domain transfer initiated after payment: ${domainName} (order ${domainOrderId})`
        );
      } else {
        await prisma.hostingOrder.update({
          where: { id: domainOrderId },
          data: { status: "FAILED" },
        });
        console.error(
          `Domain transfer failed for ${domainName}: ${result.message}`
        );
      }
    }
  } catch (error) {
    console.error("Failed to process domain after payment:", error);
    await prisma.hostingOrder.update({
      where: { id: domainOrderId },
      data: { status: "FAILED" },
    });
  }
}

/** Split a full domain into sld and tld parts */
function splitDomain(domain: string): { sld: string; tld: string } {
  const clean = domain.trim().toLowerCase();
  const multiPartTlds = [
    ".co.za", ".org.za", ".net.za", ".web.za", ".nom.za",
    ".co.uk", ".org.uk", ".co.in", ".com.au", ".co.nz",
  ];
  for (const tld of multiPartTlds) {
    if (clean.endsWith(tld)) {
      return { sld: clean.slice(0, -tld.length), tld };
    }
  }
  const lastDot = clean.lastIndexOf(".");
  if (lastDot > 0) {
    return { sld: clean.slice(0, lastDot), tld: clean.slice(lastDot) };
  }
  return { sld: clean, tld: "" };
}
