"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "@/context/SidebarContext";
import { hasStaffPermission, type StaffPermission } from "@/lib/permissions";
import type { StaffPermissions } from "@/lib/permissions";
import {
  LayoutDashboard,
  Ticket,
  FolderKanban,
  FileText,
  FileEdit,
  Receipt,
  CreditCard,
  Users,
  Flag,
  PenLine,
  ChevronDown,
  MoreHorizontal,
  Server,
  ClipboardList,
  ScrollText,
  Globe,
  CalendarClock,
  Building2,
  Bell,
  GitCommit,
  GitBranch,
  KeyRound,
  Wrench,
  Send,
  Shield,
  BarChart3,
  Gift,
  Contact,
  Mail,
  Monitor,
  Download,
  Smartphone,
  Wallet,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  permission?: StaffPermission;
  subItems?: { name: string; path: string }[];
};

const adminNavItems: NavItem[] = [
  { icon: <LayoutDashboard size={24} />, name: "Dashboard", path: "/dashboard" },
  {
    icon: <Ticket size={24} />,
    name: "Tickets",
    permission: "manageTickets",
    subItems: [
      { name: "All Tickets", path: "/issues" },
      { name: "New Ticket", path: "/issues/new" },
    ],
  },
  { icon: <FolderKanban size={24} />, name: "Projects", path: "/projects", permission: "manageProjects" },
  // { icon: <FileText size={24} />, name: "Documents", path: "/documents", permission: "manageDocuments" },
  { icon: <Receipt size={24} />, name: "Invoices", path: "/invoices", permission: "manageBilling" },
  { icon: <Wallet size={24} />, name: "Expense / Income", path: "/expense-income" },
  { icon: <Server size={24} />, name: "Hosting", path: "/hosting", permission: "manageHosting" },
  { icon: <Server size={24} />, name: "Client Hosting", path: "/hosting-clients", permission: "manageHosting" },
  { icon: <Mail size={24} />, name: "Email Accounts", path: "/email-accounts", permission: "manageHosting" },
  { icon: <Monitor size={24} />, name: "Windows Hosting", path: "/windows-hosting", permission: "manageHosting" },

  { icon: <PenLine size={24} />, name: "Document Signing", path: "/signing", permission: "manageDocuments" },
  { icon: <GitCommit size={24} />, name: "Code History", path: "/code-history", permission: "manageCode" },
  { icon: <GitBranch size={24} />, name: "Linked Repos", path: "/linked-repos", permission: "manageCode" },
  { icon: <KeyRound size={24} />, name: "Vault", path: "/vault" },
  { icon: <Gift size={24} />, name: "Referrals", path: "/referrals" },
];

const adminOtherItems: NavItem[] = [
  { icon: <Building2 size={24} />, name: "Customers", path: "/customers", permission: "manageCustomers" },
  { icon: <Contact size={24} />, name: "Contacts", path: "/contacts", permission: "manageCustomers" },
  { icon: <Users size={24} />, name: "Users", path: "/users", permission: "manageUsers" },
  { icon: <Users size={24} />, name: "Staff Roles", path: "/staff-roles", permission: "manageUsers" },
  { icon: <ClipboardList size={24} />, name: "Task Schedule", path: "/task-schedule", permission: "manageTasks" },
  { icon: <CalendarClock size={24} />, name: "Meetings Scheduler", path: "/meetings", permission: "manageTasks" },
  { icon: <CalendarClock size={24} />, name: "Daily Tasks", path: "/daily-tasks", permission: "manageTasks" },
  { icon: <Download size={24} />, name: "Code Downloads", path: "/code-downloads", permission: "manageCode" },
  { icon: <GitHubIcon size={24} />, name: "GitHub Repos", path: "/github-repos", permission: "manageCode" },
  { icon: <ScrollText size={24} />, name: "Audit Logs", path: "/audit-logs", permission: "viewAuditLogs" },
  { icon: <Flag size={24} />, name: "Flagged Emails", path: "/flagged-emails", permission: "manageSettings" },
  { icon: <Send size={24} />, name: "Bulk Email", path: "/bulk-email", permission: "bulkEmail" },
  { icon: <Smartphone size={24} />, name: "Mobile Apps", path: "/mobile-apps", permission: "manageSettings" },
  { icon: <Shield size={24} />, name: "Two-Factor Auth", path: "/two-factor" },
  { icon: <Wrench size={24} />, name: "System Settings", path: "/system-settings", permission: "manageSettings" },
];

const userNavItems: NavItem[] = [
  { icon: <LayoutDashboard size={24} />, name: "Dashboard", path: "/dashboard" },
  { icon: <Building2 size={24} />, name: "My Company", path: "/my-company" },
  {
    icon: <Ticket size={24} />,
    name: "Tickets",
    subItems: [
      { name: "My Tickets", path: "/issues" },
      { name: "New Ticket", path: "/issues/new" },
    ],
  },
  { icon: <FolderKanban size={24} />, name: "Projects", path: "/projects" },
  { icon: <ClipboardList size={24} />, name: "My Tasks", path: "/my-tasks" },
  { icon: <CalendarClock size={24} />, name: "Meetings", path: "/meetings" },
  { icon: <CalendarClock size={24} />, name: "Daily Tasks", path: "/daily-tasks" },
  // { icon: <FileText size={24} />, name: "Documents", path: "/documents" },
  { icon: <PenLine size={24} />, name: "Contracts", path: "/contracts" },
  { icon: <Receipt size={24} />, name: "Invoices", path: "/invoices" },
  { icon: <FileEdit size={24} />, name: "Request a Quote", path: "/request-quote" },
  { icon: <Server size={24} />, name: "Hosting", path: "/hosting" },
  { icon: <Mail size={24} />, name: "Email Accounts", path: "/email-accounts" },

  { icon: <GitBranch size={24} />, name: "Linked Repos", path: "/linked-repos" },
  { icon: <KeyRound size={24} />, name: "Vault", path: "/vault" },
  { icon: <Shield size={24} />, name: "Two-Factor Auth", path: "/two-factor" },
  { icon: <BarChart3 size={24} />, name: "App Stats", path: "/app-stats" },
  { icon: <Gift size={24} />, name: "Referrals", path: "/referrals" },
  { icon: <Bell size={24} />, name: "Notifications", path: "/notification-preferences" },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === "ADMIN";
  const isEmployee = session?.user?.role === "EMPLOYEE";
  const isInternalStaff = isAdmin || isEmployee;

  const sessionUser = session?.user as { role?: string; staffPermissions?: StaffPermissions } | undefined;

  // Filter nav items based on permissions for employees
  const filterByPermission = useCallback((items: NavItem[]) => {
    if (isAdmin) return items;
    return items.filter((item) => {
      if (!item.permission) return true;
      return hasStaffPermission(sessionUser, item.permission);
    });
  }, [isAdmin, sessionUser]);

  const navItems = useMemo(() => {
    if (isInternalStaff) {
      const filtered = filterByPermission(adminNavItems);
      return isAdmin ? filtered : filtered.filter((item) => item.path !== "/expense-income");
    }
    return userNavItems;
  }, [isInternalStaff, filterByPermission, isAdmin]);

  const othersItems = useMemo(() => {
    if (isInternalStaff) return filterByPermission(adminOtherItems);
    return [];
  }, [isInternalStaff, filterByPermission]);

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (path: string) => path === pathname || pathname.startsWith(path + "/"),
    [pathname]
  );

  const matchedSubmenu = useMemo(() => {
    for (const menuType of ["main", "others"] as const) {
      const items = menuType === "main" ? navItems : othersItems;
      for (let index = 0; index < items.length; index++) {
        const nav = items[index];
        if (nav.subItems) {
          for (const subItem of nav.subItems) {
            if (isActive(subItem.path)) {
              return { type: menuType, index };
            }
          }
        }
      }
    }
    return null;
  }, [isActive, navItems, othersItems]);

  useEffect(() => {
    setOpenSubmenu(matchedSubmenu);
  }, [matchedSubmenu]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const renderMenuItems = (items: NavItem[], menuType: "main" | "others") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={`${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDown
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType && openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                  size={20}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            // eslint-disable-next-line react/forbid-dom-props
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/dashboard">
          {isExpanded || isHovered || isMobileOpen ? (
            <Image src="/logo.png" alt="Global Software Services" width={120} height={48} className="h-12 w-auto" />
          ) : (
            <Image src="/logo.png" alt="GSS" width={80} height={40} className="h-10 w-auto" />
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <MoreHorizontal size={24} />
                )}
              </h2>
              {renderMenuItems(navItems, "main")}
            </div>

            {othersItems.length > 0 && (
              <div>
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    "Admin"
                  ) : (
                    <MoreHorizontal size={24} />
                  )}
                </h2>
                {renderMenuItems(othersItems, "others")}
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
