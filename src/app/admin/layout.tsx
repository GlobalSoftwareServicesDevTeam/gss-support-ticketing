import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminLayout from "@/layout/AdminLayout";

export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Only allow access if user is authenticated and is an admin
  if (!session?.user || session.user.role !== "admin") {
    redirect("/login");
  }

  return <AdminLayout>{children}</AdminLayout>;
}
