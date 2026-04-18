"use client";

import { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  Upload,
  Trash2,
  Download,
  FolderPlus,
  File,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  Loader2,
  RefreshCw,
  User as UserIcon,
} from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  iconLink: string;
  webViewLink: string;
}

interface DriveUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  googleDriveFolderId: string | null;
}

interface GoogleDriveManagerProps {
  isAdmin: boolean;
  currentUserId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function getFileIcon(mimeType: string) {
  if (mimeType.includes("folder")) return <HardDrive size={18} className="text-yellow-500" />;
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return <FileText size={18} className="text-red-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileSpreadsheet size={18} className="text-green-500" />;
  if (mimeType.includes("image")) return <FileImage size={18} className="text-purple-500" />;
  if (mimeType.includes("video")) return <FileVideo size={18} className="text-blue-500" />;
  if (mimeType.includes("audio")) return <FileAudio size={18} className="text-orange-500" />;
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed") || mimeType.includes("tar") || mimeType.includes("rar")) return <FileArchive size={18} className="text-amber-600" />;
  if (mimeType.includes("code") || mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("html") || mimeType.includes("css") || mimeType.includes("xml")) return <FileCode size={18} className="text-slate-600" />;
  return <File size={18} className="text-slate-400" />;
}

function getFileExtFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder": "Folder",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "application/msword": "DOC",
    "application/vnd.ms-excel": "XLS",
    "text/plain": "TXT",
    "text/csv": "CSV",
    "application/json": "JSON",
    "application/zip": "ZIP",
    "image/png": "PNG",
    "image/jpeg": "JPG",
    "image/gif": "GIF",
    "image/webp": "WEBP",
    "video/mp4": "MP4",
    "audio/mpeg": "MP3",
  };
  return map[mimeType] || mimeType.split("/").pop()?.toUpperCase() || "FILE";
}

export default function GoogleDriveManager({ isAdmin, currentUserId }: GoogleDriveManagerProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [users, setUsers] = useState<DriveUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUserId);
  const [folderExists, setFolderExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/google-drive/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      // silently fail
    }
  }, [isAdmin]);

  const fetchFiles = useCallback(async (userId?: string) => {
    setLoading(true);
    setError(null);
    const targetId = userId || selectedUserId;
    try {
      const url = isAdmin ? `/api/google-drive?userId=${targetId}` : "/api/google-drive";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load files");
        setFiles([]);
        setFolderExists(false);
      } else {
        setFiles(data.files || []);
        setFolderExists(data.folderExists || false);
      }
    } catch {
      setError("Failed to connect to server");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedUserId]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, fetchUsers]);

  useEffect(() => {
    fetchFiles(selectedUserId);
  }, [selectedUserId, fetchFiles]);

  async function handleCreateFolder() {
    setCreatingFolder(true);
    setError(null);
    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFolderExists(true);
        fetchUsers();
        fetchFiles(selectedUserId);
      } else {
        setError(data.error || "Failed to create folder");
      }
    } catch {
      setError("Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("userId", selectedUserId);

      const res = await fetch("/api/google-drive", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadFile(null);
        setShowUpload(false);
        fetchFiles(selectedUserId);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId: string, fileName: string) {
    if (!confirm(`Delete "${fileName}" from Google Drive? This cannot be undone.`)) return;

    setDeletingId(fileId);
    setError(null);
    try {
      const res = await fetch(`/api/google-drive/${fileId}?userId=${selectedUserId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
      } else {
        const data = await res.json();
        setError(data.error || "Delete failed");
      }
    } catch {
      setError("Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <HardDrive size={22} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-900">Google Drive Files</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchFiles(selectedUserId)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {isAdmin && folderExists && (
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm flex items-center gap-2"
            >
              <Upload size={14} /> {showUpload ? "Cancel" : "Upload File"}
            </button>
          )}
        </div>
      </div>

      {/* Admin: User selector */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
          <div className="flex items-center gap-3">
            <UserIcon size={16} className="text-slate-500" />
            <label className="text-sm font-medium text-slate-700">User Folder:</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
              title="Select user"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.email})
                  {u.googleDriveFolderId ? " ✓" : " — no folder"}
                </option>
              ))}
            </select>
            {selectedUser && !selectedUser.googleDriveFolderId && (
              <button
                onClick={handleCreateFolder}
                disabled={creatingFolder}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {creatingFolder ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                Create Folder
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload form (admin only) */}
      {isAdmin && showUpload && (
        <form onSubmit={handleUpload} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Upload to {selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}'s` : "user's"} folder</h3>
          <div className="flex items-center gap-4">
            <input
              type="file"
              title="Select file to upload"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
              required
            />
            <button
              type="submit"
              disabled={uploading || !uploadFile}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Loader2 size={24} className="animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Loading Google Drive files...</p>
        </div>
      )}

      {/* No folder state */}
      {!loading && !folderExists && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <HardDrive size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 mb-1">No Google Drive folder set up{isAdmin ? " for this user" : ""}.</p>
          {isAdmin ? (
            <p className="text-sm text-slate-400">Click &quot;Create Folder&quot; above to create a Drive folder for this user.</p>
          ) : (
            <p className="text-sm text-slate-400">Contact an administrator to set up your Drive folder.</p>
          )}
        </div>
      )}

      {/* Empty folder state */}
      {!loading && folderExists && files.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <HardDrive size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">No files in this folder yet.</p>
          {isAdmin && <p className="text-sm text-slate-400 mt-1">Use the Upload button to add files.</p>}
        </div>
      )}

      {/* File list */}
      {!loading && folderExists && files.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">File</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Size</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Modified</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {file.iconLink ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.iconLink} alt="" className="w-5 h-5" />
                      ) : (
                        getFileIcon(file.mimeType)
                      )}
                      <span className="text-sm font-medium text-slate-900 truncate max-w-xs">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {getFileExtFromMime(file.mimeType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatFileSize(parseInt(file.size))}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(file.modifiedTime).toLocaleDateString()} {new Date(file.modifiedTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/api/google-drive/${file.id}/download?userId=${selectedUserId}`}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Download"
                      >
                        <Download size={15} />
                      </a>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(file.id, file.name)}
                          disabled={deletingId === file.id}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === file.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-slate-50 text-xs text-slate-400 border-t border-slate-200">
            {files.length} file{files.length !== 1 ? "s" : ""} in folder
          </div>
        </div>
      )}
    </div>
  );
}
