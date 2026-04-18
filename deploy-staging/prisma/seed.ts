import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const adminPassword = await bcrypt.hash("CuppyShadow@1113", 12);

  const admin = await prisma.user.upsert({
    where: { email: "navis@globalsoftwareservices.co.za" },
    update: {},
    create: {
      username: "navis",
      email: "navis@globalsoftwareservices.co.za",
      firstName: "Navis",
      lastName: "Administrator",
      passwordHash: adminPassword,
      role: "ADMIN",
      emailConfirmed: true,
      company: "Global Software Services",
    },
  });

  console.log(`Admin user created: ${admin.email}`);

  // Create a sample project
  const project = await prisma.project.upsert({
    where: { id: "sample-project-1" },
    update: {},
    create: {
      id: "sample-project-1",
      projectName: "GSS Support Portal",
      onMaintenance: true,
    },
  });

  console.log(`Sample project created: ${project.projectName}`);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
