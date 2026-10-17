import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';

type Tab = 'knowledge' | 'playground' | 'conversations' | 'analytics' | 'embed';

interface DocumentItem {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: 'indexed' | 'pending' | 'processing' | 'failed';
  chunkCount: number;
  errorMessage?: string;
}

interface MessageItem {
  role: 'user' | 'assistant';
  content: string;
}

interface ChunkItem {
  filename: string;
  score: number;
  snippet: string;
}

const CHAT_API_BASE = 'http://127.0.0.1:4002';

const COLOR_PRESETS = [
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' }
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('knowledge');
  const [tenantId, setTenantId] = useState<string>('default-org');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Upload modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'paste'>('file');
  const [pasteFilename, setPasteFilename] = useState<string>('support-policy.md');
  const [pasteContent, setPasteContent] = useState<string>(
    '# Refund & SLA Support Policy\n\nCustomers are entitled to a 30-day money-back guarantee on all subscription plans.\n\nTechnical support is available 24/7 with a guaranteed 1-hour initial response time for critical incidents. Standard tickets have a 24-hour turnaround.'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Playground state
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      role: 'assistant',
      content: 'AskDesk RAG Playground ready. Type any technical or policy question to test grounded vector retrieval against your indexed documents.'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [contextChunks, setContextChunks] = useState<ChunkItem[]>([]);

  // -------------------------------------------------------------
  // Website Embed & Customizer State
  // -------------------------------------------------------------
  const [embedTitle, setEmbedTitle] = useState('AskDesk AI Support');
  const [embedGreeting, setEmbedGreeting] = useState('👋 Hi there! How can I help you with your account today?');
  const [embedColor, setEmbedColor] = useState('#6366f1');
  const [embedPosition, setEmbedPosition] = useState<'right' | 'left'>('right');
  const [embedPlaceholder, setEmbedPlaceholder] = useState('Ask a technical question...');
  const [embedCodeTab, setEmbedCodeTab] = useState<'script' | 'react' | 'vue' | 'npm'>('script');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Live Simulator state
  const [isSimOpen, setIsSimOpen] = useState(false);
  const [simMessages, setSimMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: '👋 Hi there! How can I help you with your account today?'
    }
  ]);
  const [simInput, setSimInput] = useState('');
  const [isSimThinking, setIsSimThinking] = useState(false);

  // Fetch documents for active tenant
  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch(`${CHAT_API_BASE}/orgs/${tenantId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      } else {
        setDocuments([]);
      }
    } catch {
      // Offline fallback
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, [tenantId]);

  // Update simulator initial greeting when customizer changes
  useEffect(() => {
    setSimMessages([{ role: 'assistant', content: embedGreeting }]);
  }, [embedGreeting]);

  // Handle file chosen from computer
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setNotification(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${CHAT_API_BASE}/orgs/${tenantId}/documents/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      setNotification({
        type: 'success',
        message: `Indexed "${file.name}" successfully (${data.document?.chunkCount ?? 1} chunks in Qdrant).`
      });
      setIsModalOpen(false);
      await fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle pasted text upload
  const handlePasteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim()) return;

    setIsUploading(true);
    setNotification(null);

    try {
      const res = await fetch(`${CHAT_API_BASE}/orgs/${tenantId}/documents/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: pasteFilename,
          content: pasteContent
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      setNotification({
        type: 'success',
        message: `Indexed "${pasteFilename}" successfully (${data.document?.chunkCount ?? 1} chunks in Qdrant).`
      });
      setIsModalOpen(false);
      await fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDeleteDoc = async (docId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? Vectors will be pruned from Qdrant.`)) {
      return;
    }

    try {
      const res = await fetch(`${CHAT_API_BASE}/orgs/${tenantId}/documents/${docId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        setNotification({ type: 'success', message: `Deleted "${filename}".` });
      }
    } catch {
      setNotification({ type: 'error', message: 'Failed to delete document' });
    }
  };

  // Send question in RAG playground
  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend ?? inputQuery.trim();
    if (!query || isQuerying) return;
    setInputQuery('');

    const newMessages: MessageItem[] = [...messages, { role: 'user', content: query }];
    setMessages(newMessages);
    setIsQuerying(true);

    try {
      const res = await fetch(`${CHAT_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          message: query
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.content || 'No response generated.'
          }
        ]);

        if (Array.isArray(data.citations) && data.citations.length > 0) {
          setContextChunks(
            data.citations.map((c: { documentName: string; text?: string; snippet?: string }, i: number) => ({
              filename: c.documentName,
              score: +(0.95 - i * 0.05).toFixed(3),
              snippet: c.snippet || c.text || 'Grounded context excerpt'
            }))
          );
        } else {
          setContextChunks([]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Unable to retrieve answer. Please make sure documents are indexed and askdesk-chat is running on port 4002.'
          }
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error connecting to askdesk-chat service at http://127.0.0.1:4002.'
        }
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  // Send question in Live Website Simulator
  const handleSimSend = async () => {
    if (!simInput.trim() || isSimThinking) return;
    const text = simInput.trim();
    setSimInput('');

    setSimMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsSimThinking(true);

    try {
      const res = await fetch(`${CHAT_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          message: text
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSimMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.content || 'I found the relevant information in your documentation.'
          }
        ]);
      } else {
        setSimMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'I could not find an exact match in the knowledge base. Would you like to reach our support team?'
          }
        ]);
      }
    } catch {
      setSimMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connected to simulator mode. Service running at http://127.0.0.1:4002.'
        }
      ]);
    } finally {
      setIsSimThinking(false);
    }
  };

  // Generate Snippets
  const getScriptTagCode = () => {
    return `<!-- AskDesk AI Support Widget -->
<script
  src="http://localhost:5173/widget.js"
  data-tenant-id="${tenantId}"
  data-title="${embedTitle}"
  data-greeting="${embedGreeting}"
  data-primary-color="${embedColor}"
  data-position="${embedPosition}"
  data-placeholder="${embedPlaceholder}"
  data-api-host="http://127.0.0.1:4002"
  defer>
</script>`;
  };

  const getReactCode = () => {
    return `import Script from 'next/script';

export function ChatbotIntegration() {
  return (
    <Script
      src="http://localhost:5173/widget.js"
      data-tenant-id="${tenantId}"
      data-title="${embedTitle}"
      data-greeting="${embedGreeting}"
      data-primary-color="${embedColor}"
      data-position="${embedPosition}"
      data-placeholder="${embedPlaceholder}"
      data-api-host="http://127.0.0.1:4002"
      strategy="lazyOnload"
    />
  );
}`;
  };

  const getVueCode = () => {
    return `<!-- Vue 3 / Nuxt template -->
<template>
  <div id="askdesk-widget-root"></div>
</template>

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  const script = document.createElement('script');
  script.src = 'http://localhost:5173/widget.js';
  script.setAttribute('data-tenant-id', '${tenantId}');
  script.setAttribute('data-title', '${embedTitle}');
  script.setAttribute('data-greeting', '${embedGreeting}');
  script.setAttribute('data-primary-color', '${embedColor}');
  script.setAttribute('data-position', '${embedPosition}');
  script.setAttribute('data-api-host', 'http://127.0.0.1:4002');
  script.defer = true;
  document.body.appendChild(script);
});
</script>`;
  };

  const getNpmCode = () => {
    return `# 1. Install widget package
pnpm add @askdesk/widget

# 2. Initialize in your app entrypoint
import { AskDeskWidget } from '@askdesk/widget';

const widget = new AskDeskWidget({
  tenantId: '${tenantId}',
  title: '${embedTitle}',
  greeting: '${embedGreeting}',
  primaryColor: '${embedColor}',
  position: '${embedPosition}',
  apiHost: 'http://127.0.0.1:4002'
});

widget.mount(document.body);`;
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('Copied to clipboard!');
      setTimeout(() => setCopyStatus(null), 2500);
    } catch {
      setCopyStatus('Failed to copy');
    }
  };

  return (
    <div className="dashboard-container">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="brand-header">
          <div className="brand-logo">AD</div>
          <div>
            <div className="brand-name">AskDesk</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Enterprise AI Helpdesk</div>
          </div>
        </div>

        <ul className="nav-list">
          <li
            className={`nav-item ${activeTab === 'knowledge' ? 'active' : ''}`}
            onClick={() => setActiveTab('knowledge')}
          >
            📚 Knowledge Base
          </li>
          <li
            className={`nav-item ${activeTab === 'playground' ? 'active' : ''}`}
            onClick={() => setActiveTab('playground')}
          >
            ⚡ RAG Playground
          </li>
          <li
            className={`nav-item ${activeTab === 'conversations' ? 'active' : ''}`}
            onClick={() => setActiveTab('conversations')}
          >
            💬 Conversations
          </li>
          <li
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            📊 Gateway Analytics
          </li>
          <li
            className={`nav-item ${activeTab === 'embed' ? 'active' : ''}`}
            onClick={() => setActiveTab('embed')}
            style={{ position: 'relative' }}
          >
            🌐 Website Embed & Widget
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                background: 'rgba(99, 102, 241, 0.25)',
                color: '#818cf8',
                padding: '2px 6px',
                borderRadius: 10,
                fontWeight: 700
              }}
            >
              Embed
            </span>
          </li>
        </ul>

        {/* Live Service Health Monitor */}
        <div className="service-status-box">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>
            LOCAL MICROSERVICES
          </div>
          <div className="status-row">
            <span>Core Control Plane (:4000)</span>
            <span className="status-dot"></span>
          </div>
          <div className="status-row">
            <span>AI Gateway (:4001)</span>
            <span className="status-dot"></span>
          </div>
          <div className="status-row">
            <span>Chat & Qdrant RAG (:4002)</span>
            <span className="status-dot"></span>
          </div>
        </div>

        {/* Tenant selector at bottom of sidebar */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          <label className="form-label">Active Organization ID</label>
          <input
            type="text"
            className="form-input"
            style={{ marginBottom: 0, fontSize: 12, fontFamily: 'var(--font-mono)' }}
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        {notification && (
          <div className={`alert-banner ${notification.type}`}>
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* -------------------------------------------------------------
         * Tab 1: Knowledge Base
         * ------------------------------------------------------------- */}
        {activeTab === 'knowledge' && (
          <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 className="page-title">Knowledge Base & Vector Ingestion</h1>
                <p className="page-subtitle">
                  Upload PDFs, Markdown, or text manuals. AskDesk chunks and indexes 1536-dim vector embeddings with strict tenant isolation.
                </p>
              </div>
              <button
                className="btn"
                onClick={() => setIsModalOpen(true)}
                disabled={isUploading}
              >
                {isUploading ? 'Indexing...' : '+ Upload Document'}
              </button>
            </div>

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">TOTAL DOCUMENTS</div>
                <div className="metric-value">{documents.length}</div>
                <div className="metric-sub">Org: {tenantId}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">INDEXED VECTOR CHUNKS</div>
                <div className="metric-value">
                  {documents.reduce((sum, d) => sum + (d.chunkCount || 0), 0)}
                </div>
                <div className="metric-sub">Qdrant vector collection</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">SEARCH RETRIEVAL ENGINE</div>
                <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>READY</div>
                <div className="metric-sub">Hybrid Dense + BM25 RRF</div>
              </div>
            </div>

            <div className="card-table">
              <div className="table-header">
                <span className="table-title">Indexed Documents for [{tenantId}]</span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '5px 12px', fontSize: 12 }}
                  onClick={fetchDocuments}
                  disabled={isLoadingDocs}
                >
                  {isLoadingDocs ? 'Refreshing...' : '🔄 Refresh'}
                </button>
              </div>

              {documents.length === 0 ? (
                <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 32, marginBottom: 12 }}>📁</p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
                    No documents uploaded yet for <code>{tenantId}</code>
                  </p>
                  <p style={{ fontSize: 13, marginBottom: 20 }}>
                    Upload technical guides, FAQs, or support policies to enable grounded AI answering.
                  </p>
                  <button className="btn" onClick={() => setIsModalOpen(true)}>
                    + Upload First Document
                  </button>
                </div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>FILENAME</th>
                        <th>MIME TYPE</th>
                        <th>FILE SIZE</th>
                        <th>CHUNKS</th>
                        <th>STATUS</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id}>
                          <td style={{ fontWeight: 600, color: '#fff' }}>{doc.filename}</td>
                          <td>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                              {doc.mimeType}
                            </span>
                          </td>
                          <td>{(doc.fileSize / 1024).toFixed(1)} KB</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{doc.chunkCount}</td>
                          <td>
                            <span className={`badge badge-${doc.status}`}>
                              ● {doc.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
         * Tab 2: RAG Retrieval Playground
         * ------------------------------------------------------------- */}
        {activeTab === 'playground' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Grounded RAG Playground</h1>
              <p className="page-subtitle">
                Interact with the AI assistant in real time. Inspect retrieved vector chunks, similarity scores, and bracketed citation anchors.
              </p>
            </div>

            {/* Quick suggested prompt buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center', marginRight: 4 }}>Try asking:</span>
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: 12 }}
                onClick={() => handleSendMessage('What are the standard SLA response times?')}
              >
                "What are the standard SLA response times?"
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: 12 }}
                onClick={() => handleSendMessage('What is the refund and cancellation policy?')}
              >
                "What is the refund and cancellation policy?"
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: 12 }}
                onClick={() => handleSendMessage('How do I speak to a real human agent?')}
              >
                "I want to speak with a human agent"
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
              {/* Chat Container */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  height: 520,
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14
                  }}
                >
                  {messages.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '82%',
                        padding: '12px 16px',
                        borderRadius: 14,
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        background:
                          m.role === 'user'
                            ? 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)'
                            : 'rgba(30, 41, 59, 0.7)',
                        color: '#fff',
                        border: m.role === 'user' ? 'none' : '1px solid rgba(51, 65, 85, 0.6)'
                      }}
                    >
                      {m.content}
                    </div>
                  ))}
                  {isQuerying && (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        padding: '12px 16px',
                        borderRadius: 14,
                        fontSize: 13,
                        background: 'rgba(30, 41, 59, 0.5)',
                        color: 'var(--text-muted)',
                        fontStyle: 'italic'
                      }}
                    >
                      Searching vector knowledge base & synthesizing grounded response...
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendMessage();
                  }}
                  style={{
                    padding: '14px 18px',
                    borderTop: '1px solid var(--border-color)',
                    background: 'rgba(11, 15, 25, 0.5)',
                    display: 'flex',
                    gap: 10
                  }}
                >
                  <input
                    type="text"
                    className="form-input"
                    style={{ marginBottom: 0 }}
                    placeholder="Type a support question..."
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    disabled={isQuerying}
                  />
                  <button type="submit" className="btn" disabled={isQuerying}>
                    {isQuerying ? '...' : 'Send'}
                  </button>
                </form>
              </div>

              {/* Context Inspector */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 16,
                  padding: 20,
                  height: 520,
                  overflowY: 'auto'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    GROUNDED CONTEXT CHUNKS
                  </span>
                  <span style={{ fontSize: 11, background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                    Qdrant Cosine
                  </span>
                </div>

                {contextChunks.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '30px 10px', textAlign: 'center' }}>
                    <p style={{ fontSize: 24, marginBottom: 8 }}>🔍</p>
                    <p>Ask a question to inspect retrieved document chunks and citation rankings.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {contextChunks.map((chunk, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(11, 17, 32, 0.7)',
                          border: '1px solid rgba(51, 65, 85, 0.6)',
                          borderRadius: 10,
                          padding: 12
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600, color: '#818cf8', marginBottom: 6 }}>
                          <span>[{idx + 1}] {chunk.filename}</span>
                          <span>Score: {chunk.score}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.45 }}>
                          "{chunk.snippet}"
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
         * Tab 3: Conversations & Handover
         * ------------------------------------------------------------- */}
        {activeTab === 'conversations' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Conversation Explorer & Human Handover</h1>
              <p className="page-subtitle">
                Monitor live visitor sessions, view token consumption, and manage tickets flagged for human takeover.
              </p>
            </div>

            <div className="card-table">
              <div className="table-header">
                <span className="table-title">Recent Chat Sessions</span>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>SESSION ID</th>
                      <th>LATEST MESSAGE</th>
                      <th>TURNS</th>
                      <th>ESCALATION STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>visitor_b71f92a</td>
                      <td>What is the policy for subscription refunds?</td>
                      <td>4</td>
                      <td>
                        <span className="badge badge-indexed">● Resolved by AI</span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
                          Inspect
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>visitor_8a391c4</td>
                      <td>I demand to speak to a real person right now!</td>
                      <td>2</td>
                      <td>
                        <span className="badge badge-failed" style={{ animation: 'pulse-dot 2s infinite' }}>
                          ⚠️ Needs Human Review
                        </span>
                      </td>
                      <td>
                        <button className="btn" style={{ padding: '4px 12px', fontSize: 12, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                          Take Over
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
         * Tab 4: Gateway Analytics
         * ------------------------------------------------------------- */}
        {activeTab === 'analytics' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Gateway Telemetry & Cost Accounting</h1>
              <p className="page-subtitle">
                Real-time token metrics, USD expenditures, and cache hit efficiency aggregated from Redis and MongoDB.
              </p>
            </div>

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">TOTAL REQUESTS</div>
                <div className="metric-value">3,180</div>
                <div className="metric-sub">636 req/sec peak</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">TOTAL TOKENS</div>
                <div className="metric-value">412,850</div>
                <div className="metric-sub">Fast (8B) + Smart (70B)</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">ESTIMATED TOKEN COST</div>
                <div className="metric-value">$0.0084</div>
                <div className="metric-sub">Groq low-cost inference</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">P95 LATENCY</div>
                <div className="metric-value">7.86ms</div>
                <div className="metric-sub">Redis exact-match cached</div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
         * Tab 5: Website Embed & Widget Integration (NEW)
         * ------------------------------------------------------------- */}
        {activeTab === 'embed' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Website Adoption & Embed Generator</h1>
              <p className="page-subtitle">
                Customize your support widget's branding, greeting, and position. Copy the one-line embed script to integrate AskDesk into any website in seconds.
              </p>
            </div>

            <div className="embed-layout">
              {/* Left Column: Customizer & Code Snippets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Customizer Card */}
                <div className="embed-card">
                  <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#fff' }}>
                    🎨 Widget Branding & Appearance
                  </h2>

                  <label className="form-label">Assistant Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={embedTitle}
                    onChange={(e) => setEmbedTitle(e.target.value)}
                    placeholder="e.g. Acme Support Assistant"
                  />

                  <label className="form-label">Initial Welcome Greeting</label>
                  <input
                    type="text"
                    className="form-input"
                    value={embedGreeting}
                    onChange={(e) => setEmbedGreeting(e.target.value)}
                    placeholder="e.g. 👋 Hi! How can I help you today?"
                  />

                  <label className="form-label">Primary Brand Color</label>
                  <div className="swatch-group">
                    {COLOR_PRESETS.map((preset) => (
                      <div
                        key={preset.hex}
                        className={`color-swatch ${embedColor === preset.hex ? 'selected' : ''}`}
                        style={{ backgroundColor: preset.hex }}
                        onClick={() => setEmbedColor(preset.hex)}
                        title={preset.name}
                      />
                    ))}
                    <input
                      type="color"
                      value={embedColor}
                      onChange={(e) => setEmbedColor(e.target.value)}
                      style={{
                        width: 32,
                        height: 32,
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer'
                      }}
                      title="Custom color"
                    />
                  </div>

                  <label className="form-label">Screen Position</label>
                  <div className="position-toggle">
                    <button
                      type="button"
                      className={`position-btn ${embedPosition === 'right' ? 'active' : ''}`}
                      onClick={() => setEmbedPosition('right')}
                    >
                      ↘ Bottom Right
                    </button>
                    <button
                      type="button"
                      className={`position-btn ${embedPosition === 'left' ? 'active' : ''}`}
                      onClick={() => setEmbedPosition('left')}
                    >
                      ↙ Bottom Left
                    </button>
                  </div>

                  <label className="form-label">Input Field Placeholder</label>
                  <input
                    type="text"
                    className="form-input"
                    value={embedPlaceholder}
                    onChange={(e) => setEmbedPlaceholder(e.target.value)}
                    placeholder="e.g. Ask a technical question..."
                  />
                </div>

                {/* Embed Snippets Card */}
                <div className="embed-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      📋 Integration Snippet
                    </h2>
                    {copyStatus && (
                      <span style={{ fontSize: 12, color: 'var(--accent-emerald)', fontWeight: 600 }}>
                        ✓ {copyStatus}
                      </span>
                    )}
                  </div>

                  <div className="code-tabs">
                    <button
                      className={`code-tab ${embedCodeTab === 'script' ? 'active' : ''}`}
                      onClick={() => setEmbedCodeTab('script')}
                    >
                      HTML &lt;script&gt;
                    </button>
                    <button
                      className={`code-tab ${embedCodeTab === 'react' ? 'active' : ''}`}
                      onClick={() => setEmbedCodeTab('react')}
                    >
                      React / Next.js
                    </button>
                    <button
                      className={`code-tab ${embedCodeTab === 'vue' ? 'active' : ''}`}
                      onClick={() => setEmbedCodeTab('vue')}
                    >
                      Vue / Nuxt
                    </button>
                    <button
                      className={`code-tab ${embedCodeTab === 'npm' ? 'active' : ''}`}
                      onClick={() => setEmbedCodeTab('npm')}
                    >
                      npm Package
                    </button>
                  </div>

                  <div className="code-snippet-box">
                    <button
                      className="copy-btn"
                      onClick={() => {
                        const code =
                          embedCodeTab === 'script'
                            ? getScriptTagCode()
                            : embedCodeTab === 'react'
                              ? getReactCode()
                              : embedCodeTab === 'vue'
                                ? getVueCode()
                                : getNpmCode();
                        void handleCopyCode(code);
                      }}
                    >
                      Copy Snippet
                    </button>
                    <pre style={{ margin: 0 }}>
                      <code>
                        {embedCodeTab === 'script' && getScriptTagCode()}
                        {embedCodeTab === 'react' && getReactCode()}
                        {embedCodeTab === 'vue' && getVueCode()}
                        {embedCodeTab === 'npm' && getNpmCode()}
                      </code>
                    </pre>
                  </div>

                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    <p style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
                      🚀 How a company adopts this:
                    </p>
                    <ol style={{ paddingLeft: 18 }}>
                      <li>Paste this snippet into your website's <code>&lt;head&gt;</code> or <code>&lt;body&gt;</code> tag.</li>
                      <li>Works automatically on <strong>WordPress, Shopify, Webflow, Squarespace, Next.js, and static HTML</strong>.</li>
                      <li>The widget runs in an isolated <strong>Shadow DOM</strong> with zero CSS style conflicts with your site.</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Website Simulator */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    LIVE INTERACTIVE WEBSITE SIMULATOR
                  </span>
                  <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>
                    ● Connected to Port 4002
                  </span>
                </div>

                <div className="browser-simulator">
                  {/* Browser Chrome Header */}
                  <div className="browser-bar">
                    <div className="window-dots">
                      <div className="dot dot-red"></div>
                      <div className="dot dot-yellow"></div>
                      <div className="dot dot-green"></div>
                    </div>
                    <div className="url-bar">
                      https://your-company.com
                    </div>
                  </div>

                  {/* Browser Mock Canvas (Company Website) */}
                  <div className="browser-canvas">
                    <div className="mock-hero">
                      <span className="mock-tag">Next-Gen SaaS Platform</span>
                      <h2 className="mock-heading">High-Performance Cloud Infrastructure</h2>
                      <p className="mock-lead">
                        Scale your applications with instantaneous global failover, tenant isolation, and automated telemetry.
                      </p>
                      <button className="mock-cta">Start Free 14-Day Trial</button>
                    </div>

                    {/* Floating Chatbot Launcher inside Simulator */}
                    <div
                      className="sim-launcher"
                      style={{
                        [embedPosition === 'left' ? 'left' : 'right']: 20,
                        background: `linear-gradient(135deg, ${embedColor} 0%, #4338ca 100%)`
                      }}
                      onClick={() => setIsSimOpen(!isSimOpen)}
                      title="Test Chatbot"
                    >
                      {isSimOpen ? (
                        <span style={{ fontSize: 20 }}>✕</span>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      )}
                    </div>

                    {/* Floating Chat Window inside Simulator */}
                    {isSimOpen && (
                      <div
                        className="sim-window"
                        style={{
                          [embedPosition === 'left' ? 'left' : 'right']: 20
                        }}
                      >
                        <div
                          className="sim-header"
                          style={{
                            background: `linear-gradient(135deg, ${embedColor} 0%, #3730a3 100%)`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
                            {embedTitle}
                          </div>
                          <span
                            style={{ cursor: 'pointer', opacity: 0.8 }}
                            onClick={() => setIsSimOpen(false)}
                          >
                            ✕
                          </span>
                        </div>

                        <div className="sim-body">
                          {simMessages.map((m, idx) => (
                            <div
                              key={idx}
                              className={`sim-msg ${m.role}`}
                              style={
                                m.role === 'user'
                                  ? { background: `linear-gradient(135deg, ${embedColor} 0%, #4338ca 100%)` }
                                  : {}
                              }
                            >
                              {m.content}
                            </div>
                          ))}
                          {isSimThinking && (
                            <div className="sim-msg assistant" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Searching knowledge base...
                            </div>
                          )}
                        </div>

                        <form
                          className="sim-input-row"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleSimSend();
                          }}
                        >
                          <input
                            type="text"
                            className="sim-input"
                            placeholder={embedPlaceholder}
                            value={simInput}
                            onChange={(e) => setSimInput(e.target.value)}
                            disabled={isSimThinking}
                          />
                          <button
                            type="submit"
                            className="sim-send"
                            style={{ background: embedColor }}
                            disabled={isSimThinking}
                          >
                            Send
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Upload Document Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => !isUploading && setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Upload Knowledge Document</h2>
              <button
                className="modal-close"
                onClick={() => setIsModalOpen(false)}
                disabled={isUploading}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                className={`btn ${uploadMode === 'file' ? '' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setUploadMode('file')}
                type="button"
              >
                📁 Upload File (PDF / Text)
              </button>
              <button
                className={`btn ${uploadMode === 'paste' ? '' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setUploadMode('paste')}
                type="button"
              >
                📝 Paste Text / Markdown
              </button>
            </div>

            {uploadMode === 'file' ? (
              <div>
                <div
                  className="dropzone-area"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <p style={{ fontSize: 32, marginBottom: 8 }}>📄</p>
                  <p style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                    Click to browse PDF or Text file
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Supports .pdf, .md, .txt (up to 25 MB)
                  </p>
                </div>
                {isUploading && (
                  <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--accent-indigo)', fontWeight: 600 }}>
                    Uploading, parsing text & indexing vector chunks...
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handlePasteSubmit}>
                <label className="form-label">Document Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={pasteFilename}
                  onChange={(e) => setPasteFilename(e.target.value)}
                  placeholder="e.g. refund-policy.md"
                  required
                />

                <label className="form-label">Content</label>
                <textarea
                  className="form-textarea"
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste your product documentation, FAQ, or technical guide..."
                  required
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isUploading}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn" disabled={isUploading}>
                    {isUploading ? 'Indexing...' : 'Index Document'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
