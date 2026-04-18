import { google, drive_v3 } from "googleapis";

let driveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (driveClient) return driveClient;

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Google Drive credentials not configured. Set GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY env vars.");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

/** The root folder ID under which all user folders are created */
function getRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID env var is not set.");
  return id;
}

/** Create a folder for a user inside the root folder. Returns the folder ID. */
export async function createUserFolder(userName: string, userEmail: string): Promise<string> {
  const drive = getDriveClient();
  const folderName = `${userName} (${userEmail})`;

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [getRootFolderId()],
    },
    fields: "id",
  });

  return res.data.id!;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  iconLink: string;
  webViewLink: string;
}

/** List all files in a user's folder */
export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, iconLink, webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
      pageToken,
    });

    if (res.data.files) {
      for (const f of res.data.files) {
        files.push({
          id: f.id!,
          name: f.name!,
          mimeType: f.mimeType!,
          size: f.size || "0",
          createdTime: f.createdTime!,
          modifiedTime: f.modifiedTime!,
          iconLink: f.iconLink || "",
          webViewLink: f.webViewLink || "",
        });
      }
    }

    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return files;
}

/** Upload a file to a user's folder */
export async function uploadFile(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<{ id: string; name: string }> {
  const drive = getDriveClient();
  const { Readable } = await import("stream");

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(fileBuffer),
    },
    fields: "id, name",
  });

  return { id: res.data.id!, name: res.data.name! };
}

/** Delete a file from Google Drive */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

/** Download a file from Google Drive. Returns the file buffer and metadata. */
export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const drive = getDriveClient();

  // Get file metadata first
  const meta = await drive.files.get({
    fileId,
    fields: "name, mimeType",
  });

  const name = meta.data.name!;
  const mimeType = meta.data.mimeType!;

  // For Google Docs types, export as PDF
  const googleDocTypes: Record<string, string> = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation": "application/pdf",
  };

  let buffer: Buffer;

  if (googleDocTypes[mimeType]) {
    const res = await drive.files.export(
      { fileId, mimeType: googleDocTypes[mimeType] },
      { responseType: "arraybuffer" }
    );
    buffer = Buffer.from(res.data as ArrayBuffer);
  } else {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    buffer = Buffer.from(res.data as ArrayBuffer);
  }

  const exportMime = googleDocTypes[mimeType] || mimeType;

  return { buffer, name, mimeType: exportMime };
}

/** Verify a file belongs to a specific folder (security check) */
export async function verifyFileInFolder(fileId: string, folderId: string): Promise<boolean> {
  const drive = getDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: "parents",
  });
  return res.data.parents?.includes(folderId) || false;
}

/** Get folder metadata */
export async function getFolderInfo(folderId: string): Promise<{ name: string; fileCount: number }> {
  const drive = getDriveClient();

  const meta = await drive.files.get({
    fileId: folderId,
    fields: "name",
  });

  const countRes = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: 1000,
  });

  return {
    name: meta.data.name!,
    fileCount: countRes.data.files?.length || 0,
  };
}
