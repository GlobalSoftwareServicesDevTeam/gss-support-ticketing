"use client";
import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { ChevronDown, LogOut } from "lucide-react";

export default function UserDropdown() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dark:text-gray-400 dropdown-toggle"
      >
        <span className="mr-3 flex items-center justify-center overflow-hidden rounded-full h-11 w-11 bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 font-semibold text-sm">
          {initials}
        </span>

        <span className="block mr-1 font-medium text-theme-sm">
          {session?.user?.name || "User"}
        </span>

        <ChevronDown
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          size={18}
        />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {session?.user?.name || "User"}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {session?.user?.email || ""}
          </span>
          {session?.user?.role && (
            <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-theme-xs font-medium text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
              {session.user.role}
            </span>
          )}
        </div>

        <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => {
              closeDropdown();
              signOut({ callbackUrl: "/login" });
            }}
            className="flex w-full items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
          >
            <LogOut
              className="text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300"
              size={24}
            />
            Sign Out
          </button>
        </div>
      </Dropdown>
    </div>
  );
}
