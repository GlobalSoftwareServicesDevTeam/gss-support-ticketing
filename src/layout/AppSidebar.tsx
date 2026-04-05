"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "@/context/SidebarContext";
import {
  LayoutDashboard,
  Ticket,
  FolderKanban,
  FileText,
  Receipt,
  CreditCard,
  Users,
  Mail,
  Flag,
  PenLine,
  CalendarDays,
  ChevronDown,
  MoreHorizontal,
  Server,
} from "lucide-react";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string }[];
};

const adminNavItems: NavItem[] = [
  { icon: <LayoutDashboard size={24} />, name: "Dashboard", path: "/dashboard" },
  {
    icon: <Ticket size={24} />,
    name: "Tickets",
    subItems: [
      { name: "All Tickets", path: "/issues" },
      { name: "New Ticket", path: "/issues/new" },
    ],
  },
  { icon: <FolderKanban size={24} />, name: "Projects", path: "/projects" },
  { icon: <FileText size={24} />, name: "Documents", path: "/documents" },
  { icon: <Receipt size={24} />, name: "Invoices", path: "/invoices" },
  { icon: <CreditCard size={24} />, name: "Payments", path: "/payments" },
  { icon: <Server size={24} />, name: "Hosting", path: "/hosting" },
  { icon: <PenLine size={24} />, name: "Document Signing", path: "/signing" },
  { icon: <CalendarDays size={24} />, name: "Task Schedule", path: "/task-schedule" },
];

const adminOtherItems: NavItem[] = [
  { icon: <Users size={24} />, name: "Users", path: "/users" },
  { icon: <Flag size={24} />, name: "Flagged Emails", path: "/flagged-emails" },
  { icon: <Mail size={24} />, name: "Email Settings", path: "/email-settings" },
];

const userNavItems: NavItem[] = [
  { icon: <LayoutDashboard size={24} />, name: "Dashboard", path: "/dashboard" },
  {
    icon: <Ticket size={24} />,
    name: "Tickets",
    subItems: [
      { name: "My Tickets", path: "/issues" },
      { name: "New Ticket", path: "/issues/new" },
    ],
  },
  { icon: <FolderKanban size={24} />, name: "Projects", path: "/projects" },
  { icon: <FileText size={24} />, name: "Documents", path: "/documents" },
  { icon: <Receipt size={24} />, name: "Invoices", path: "/invoices" },
  { icon: <CreditCard size={24} />, name: "Payments", path: "/payments" },
  { icon: <Server size={24} />, name: "Hosting", path: "/hosting" },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === "ADMIN";
  const navItems = isAdmin ? adminNavItems : userNavItems;
  const othersItems = useMemo(() => (isAdmin ? adminOtherItems : []), [isAdmin]);

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
            <span className="text-xl font-bold text-brand-500">GSS Support</span>
          ) : (
            <span className="text-xl font-bold text-brand-500">GSS</span>
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
