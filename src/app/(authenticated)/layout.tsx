import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminLayout from "@/layout/AdminLayout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <AdminLayout>{children}</AdminLayout>;
}
