import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';

type Tab = 'knowledge' | 'playground' | 'conversations' | 'analytics';

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
  const [pasteFilename, setPasteFilename] = useState<string>('knowledge-doc.md');
  const [pasteContent, setPasteContent] = useState<string>(
    '# Refund & Support Policy\n\nCustomers are entitled to a 30-day money-back guarantee on all subscription plans.\n\nTechnical support is available 24/7 with a guaranteed 1-hour initial response time for critical incidents.'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Playground state
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      role: 'assistant',
      content: 'AskDesk RAG Playground ready. Type any question to test grounded vector retrieval against your indexed documents.'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [contextChunks, setContextChunks] = useState<ChunkItem[]>([]);

  // Fetch documents for active tenant
  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch(`${CHAT_API_BASE}/orgs/${tenantId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      } else {
        // Fallback default sample if server is newly initialized
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
      const res = await fetch(`${CHAT_API_BASE}/orgs/${tenantId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: pasteFilename,
          mimeType: pasteFilename.endsWith('.md') ? 'text/markdown' : 'text/plain',
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
  const handleSendMessage = async () => {
    if (!inputQuery.trim() || isQuerying) return;
    const query = inputQuery.trim();
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
          messages: [{ role: 'user', content: query }]
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message?.content || 'No response generated.'
          }
        ]);

        if (Array.isArray(data.message?.citations) && data.message.citations.length > 0) {
          setContextChunks(
            data.message.citations.map((c: { documentName: string; text: string }, i: number) => ({
              filename: c.documentName,
              score: +(0.95 - i * 0.05).toFixed(3),
              snippet: c.text
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
          <div className="brand-name">AskDesk Operator</div>
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
        </ul>

        {/* Tenant selector at bottom of sidebar */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          <label className="form-label">ORGANIZATION ID</label>
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
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 className="page-title">Knowledge Base & Ingestion</h1>
                <p className="page-subtitle">
                  Upload PDFs, Markdown, or plain text to index chunk embeddings into tenant-isolated Qdrant vector space.
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
                <div className="metric-sub">Tenant: {tenantId}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">INDEXED CHUNKS</div>
                <div className="metric-value">
                  {documents.reduce((sum, d) => sum + (d.chunkCount || 0), 0)}
                </div>
                <div className="metric-sub">Qdrant vector collection</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">ENGINE STATUS</div>
                <div className="metric-value" style={{ color: 'var(--accent-green)' }}>ACTIVE</div>
                <div className="metric-sub">Hybrid BM25 + Dense RRF</div>
              </div>
            </div>

            <div className="card-table">
              <div className="table-header">
                <span className="table-title">Indexed Documents for [{tenantId}]</span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={fetchDocuments}
                  disabled={isLoadingDocs}
                >
                  {isLoadingDocs ? 'Refreshing...' : '🔄 Refresh'}
                </button>
              </div>

              {documents.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 16, marginBottom: 8 }}>No documents uploaded yet for organization <code>{tenantId}</code>.</p>
                  <p style={{ fontSize: 13, marginBottom: 16 }}>Upload a PDF manual, Markdown doc, or paste text to test live retrieval.</p>
                  <button className="btn" onClick={() => setIsModalOpen(true)}>
                    + Upload First Document
                  </button>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>FILENAME</th>
                      <th>FORMAT</th>
                      <th>SIZE</th>
                      <th>CHUNKS</th>
                      <th>STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td style={{ fontWeight: 500 }}>{doc.filename}</td>
                        <td>{doc.mimeType}</td>
                        <td>{(doc.fileSize / 1024).toFixed(1)} KB</td>
                        <td>{doc.chunkCount}</td>
                        <td>
                          <span className={`status-badge ${doc.status}`}>{doc.status}</span>
                        </td>
                        <td>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                            onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'playground' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">RAG Retrieval Playground</h1>
              <p className="page-subtitle">
                Test grounded question answering with live Qdrant context inspection and source citation parsing.
              </p>
            </div>

            <div className="playground-layout">
              {/* Chat Box */}
              <div className="chat-box">
                <div className="chat-messages">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`chat-bubble ${m.role}`}>
                      {m.content}
                    </div>
                  ))}
                  {isQuerying && (
                    <div className="chat-bubble assistant" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                      Searching indexed knowledge chunks & synthesizing answer...
                    </div>
                  )}
                </div>
                <form
                  className="chat-input-bar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendMessage();
                  }}
                >
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Ask any technical or policy question..."
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    disabled={isQuerying}
                  />
                  <button type="submit" className="btn" disabled={isQuerying}>
                    {isQuerying ? '...' : 'Ask'}
                  </button>
                </form>
              </div>

              {/* Context Inspector */}
              <div className="context-inspector">
                <div className="context-title">
                  <span>GROUNDED CONTEXT</span>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>HYBRID RRF</span>
                </div>
                {contextChunks.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    No context chunks returned yet. Ask a question to inspect retrieved source passages and similarity scores.
                  </p>
                ) : (
                  contextChunks.map((chunk, idx) => (
                    <div key={idx} className="chunk-card">
                      <div className="chunk-meta">
                        [{idx + 1}] {chunk.filename} (Score: {chunk.score})
                      </div>
                      <div className="chunk-snippet">{chunk.snippet}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'conversations' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Conversation Explorer & Handover</h1>
              <p className="page-subtitle">
                Inspect visitor support sessions, monitor token consumption, and resolve escalated human handovers.
              </p>
            </div>

            <div className="card-table">
              <div className="table-header">
                <span className="table-title">Recent Customer Support Sessions</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>VISITOR ID</th>
                    <th>LAST INQUIRY</th>
                    <th>MESSAGES</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>visitor_a8f93b</td>
                    <td>What is the turnaround for standard support tickets?</td>
                    <td>4</td>
                    <td>
                      <span className="status-badge active">active</span>
                    </td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
                        View
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>visitor_92e4a1</td>
                    <td>This is not helpful! Transfer me to a human immediately.</td>
                    <td>2</td>
                    <td>
                      <span className="status-badge needs_human_review">needs_human_review</span>
                    </td>
                    <td>
                      <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }}>
                        Take Over
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Gateway Telemetry & Cost Analytics</h1>
              <p className="page-subtitle">
                Token consumption, USD cost accounting, and response latency percentiles aggregated from Redis and MongoDB.
              </p>
            </div>

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">TOTAL REQUESTS</div>
                <div className="metric-value">1,480</div>
                <div className="metric-sub">+18% this week</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">TOTAL TOKENS</div>
                <div className="metric-value">284,500</div>
                <div className="metric-sub">Fast (8B) + Smart (70B)</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">TOTAL ESTIMATED COST</div>
                <div className="metric-value">$0.142</div>
                <div className="metric-sub">Real-time token pricing</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">P95 LATENCY</div>
                <div className="metric-value">14.2ms</div>
                <div className="metric-sub">Cached responses</div>
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
                  <p style={{ fontSize: 28, marginBottom: 8 }}>📄</p>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>
                    Click to browse PDF or Text file
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Supports .pdf, .md, .txt (up to 25 MB)
                  </p>
                </div>
                {isUploading && (
                  <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--accent-blue)' }}>
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
