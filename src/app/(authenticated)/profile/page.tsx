"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { User, Phone, Building2, MapPin, Briefcase, Shield, Key, Eye, EyeOff } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  company: string | null;
  companyRegNo: string | null;
  companyVatNo: string | null;
  companyAddress: string | null;
  position: string | null;
  role: string;
  totpEnabled: boolean;
  oauthProvider: string | null;
  createdAt: string;
}

export default function ProfilePage() {
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  // Personal info form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [position, setPosition] = useState("");

  // Company info form
  const [company, setCompany] = useState("");
  const [companyRegNo, setCompanyRegNo] = useState("");
  const [companyVatNo, setCompanyVatNo] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/users/${session.user.id}`)
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setPhoneNumber(data.phoneNumber || "");
        setPosition(data.position || "");
        setCompany(data.company || "");
        setCompanyRegNo(data.companyRegNo || "");
        setCompanyVatNo(data.companyVatNo || "");
        setCompanyAddress(data.companyAddress || "");
        setLoading(false);
      });
  }, [session?.user?.id]);

  function showMsg(text: string, type: "success" | "error") {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  }

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;
    setSaving(true);

    const res = await fetch(`/api/users/${session.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, phoneNumber, position }),
    });

    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      showMsg("Personal information updated successfully", "success");
      await updateSession();
    } else {
      showMsg(data.error || "Failed to update", "error");
    }
  }

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;
    setSaving(true);

    const res = await fetch(`/api/users/${session.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, companyRegNo, companyVatNo, companyAddress }),
    });

    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      showMsg("Company information updated successfully", "success");
    } else {
      showMsg(data.error || "Failed to update", "error");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;

    if (newPassword.length < 6) {
      showMsg("New password must be at least 6 characters", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showMsg("New passwords do not match", "error");
      return;
    }

    setChangingPw(true);

    const res = await fetch(`/api/users/${session.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();
    setChangingPw(false);

    if (res.ok) {
      showMsg("Password changed successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      showMsg(data.error || "Failed to change password", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your account details and preferences</p>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          msgType === "error"
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-green-50 border border-green-200 text-green-700"
        }`}>
          {msg}
        </div>
      )}

      {/* Account Overview */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 font-bold text-xl">
            {firstName?.[0]?.toUpperCase()}{lastName?.[0]?.toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{firstName} {lastName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                profile?.role === "ADMIN"
                  ? "bg-red-100 text-red-700"
                  : profile?.role === "EMPLOYEE"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                {profile?.role}
              </span>
              {profile?.totpEnabled && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700">2FA Enabled</span>
              )}
              {profile?.oauthProvider && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">{profile.oauthProvider}</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-gray-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-400 block text-xs">Username</span>
            <span className="text-slate-700 dark:text-slate-300">@{profile?.username}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs">Email</span>
            <span className="text-slate-700 dark:text-slate-300">{profile?.email}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs">Phone</span>
            <span className="text-slate-700 dark:text-slate-300">{phoneNumber || "—"}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs">Member Since</span>
            <span className="text-slate-700 dark:text-slate-300">
              {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <User size={20} className="text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Personal Information</h2>
        </div>
        <form onSubmit={handleSavePersonal} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><Phone size={14} /> Phone Number</span>
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. +27 12 345 6789"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><Briefcase size={14} /> Position / Title</span>
            </label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Developer, Manager"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Personal Info"}
            </button>
          </div>
        </form>
      </div>

      {/* Company Information */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={20} className="text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Company Information</h2>
        </div>
        <form onSubmit={handleSaveCompany} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Company Name</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Your company name"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Registration Number</label>
            <input
              type="text"
              value={companyRegNo}
              onChange={(e) => setCompanyRegNo(e.target.value)}
              placeholder="Company reg number"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">VAT Number</label>
            <input
              type="text"
              value={companyVatNo}
              onChange={(e) => setCompanyVatNo(e.target.value)}
              placeholder="VAT number"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1"><MapPin size={14} /> Company Address</span>
            </label>
            <input
              type="text"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="Full address"
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Company Info"}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      {!profile?.oauthProvider && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-800 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Key size={20} className="text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Change Password</h2>
          </div>
          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPw ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  title="Toggle visibility"
                >
                  {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNewPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  minLength={6}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  title="Toggle visibility"
                >
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                title="Confirm new password"
                minLength={6}
                className="w-full px-3 py-2 border border-slate-300 dark:border-gray-700 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={changingPw}
                className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
              >
                {changingPw ? "Changing..." : "Change Password"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security Info */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Security</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Two-Factor Authentication</span>
              <p className="text-xs text-slate-500">Add an extra layer of security to your account</p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              profile?.totpEnabled
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-500"
            }`}>
              {profile?.totpEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          {profile?.oauthProvider && (
            <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-gray-800">
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sign-in Method</span>
                <p className="text-xs text-slate-500">You sign in using a third-party provider</p>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 capitalize">
                {profile.oauthProvider}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-gray-800">
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</span>
              <p className="text-xs text-slate-500">{profile?.email}</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
              Verified
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
