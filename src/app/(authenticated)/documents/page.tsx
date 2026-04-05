"use client";

import { useEffect, useState, useCallback } from "react";
import DocumentManager from "@/components/document-manager";

interface Document {
  id: string;
  name: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  category: string;
  notes: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
  projectId: string | null;
  project: { id: string; projectName: string } | null;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data) => {
        setDocuments(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading documents...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Document Portal</h1>
      <DocumentManager documents={documents} onRefresh={fetchDocuments} />
    </div>
  );
}
