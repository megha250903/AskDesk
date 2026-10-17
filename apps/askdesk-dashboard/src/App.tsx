import { useState } from 'react';

type Tab = 'knowledge' | 'playground' | 'conversations' | 'analytics';

interface DocumentItem {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: 'indexed' | 'processing' | 'failed';
  chunkCount: number;
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

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('knowledge');

  // Sample Documents
  const [documents, setDocuments] = useState<DocumentItem[]>([
    {
      id: 'doc_1',
      filename: 'technical-support-sla.pdf',
      fileSize: 42800,
      mimeType: 'application/pdf',
      status: 'indexed',
      chunkCount: 14
    },
    {
      id: 'doc_2',
      filename: 'api-authentication-guide.md',
      fileSize: 18450,
      mimeType: 'text/markdown',
      status: 'indexed',
      chunkCount: 8
    },
    {
      id: 'doc_3',
      filename: 'billing-and-refund-policy.pdf',
      fileSize: 31200,
      mimeType: 'application/pdf',
      status: 'indexed',
      chunkCount: 11
    }
  ]);

  // Playground State
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      role: 'assistant',
      content:
        'AskDesk RAG Playground ready. Type any technical or support query to test grounded vector retrieval.'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [contextChunks, setContextChunks] = useState<ChunkItem[]>([
    {
      filename: 'technical-support-sla.pdf',
      score: 0.892,
      snippet:
        'Tier-1 critical severity tickets carry a guaranteed 1-hour first response SLA with 24/7 coverage...'
    },
    {
      filename: 'api-authentication-guide.md',
      score: 0.745,
      snippet:
        'API keys use the secret-reveal-once pattern and can be revoked at any time via organization settings...'
    }
  ]);

  const handleSendMessage = () => {
    if (!inputQuery.trim()) return;
    const userQ = inputQuery;
    setInputQuery('');

    setMessages((prev) => [...prev, { role: 'user', content: userQ }]);

    // Simulated assistant response with citation
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Based on technical documentation [1], critical incidents carry a guaranteed 1-hour SLA response turnaround, while standard tickets have 24-hour coverage.`
        }
      ]);
      setContextChunks([
        {
          filename: 'technical-support-sla.pdf',
          score: 0.941,
          snippet:
            'Critical severity tickets guarantee a 1-hour initial response time, while standard technical queries turnaround in 24 hours.'
        }
      ]);
    }, 400);
  };

  const handleUploadMock = () => {
    const newDoc: DocumentItem = {
      id: `doc_${Date.now()}`,
      filename: `product-manual-v${documents.length + 1}.txt`,
      fileSize: 14200,
      mimeType: 'text/plain',
      status: 'indexed',
      chunkCount: 6
    };
    setDocuments((prev) => [newDoc, ...prev]);
  };

  return (
    <div className="dashboard-container">
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
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        {activeTab === 'knowledge' && (
          <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 className="page-title">Knowledge Base & Ingestion</h1>
                <p className="page-subtitle">
                  Upload documents to generate multi-tenant vector embeddings and index chunks into Qdrant.
                </p>
              </div>
              <button className="btn" onClick={handleUploadMock}>
                + Upload Document
              </button>
            </div>

            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">TOTAL DOCUMENTS</div>
                <div className="metric-value">{documents.length}</div>
                <div className="metric-sub">100% tenant isolated</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">INDEXED CHUNKS</div>
                <div className="metric-value">
                  {documents.reduce((sum, d) => sum + d.chunkCount, 0)}
                </div>
                <div className="metric-sub">Cosine vector space</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">RETRIEVAL LATENCY</div>
                <div className="metric-value">12.4ms</div>
                <div className="metric-sub">p95 hybrid search</div>
              </div>
            </div>

            <div className="card-table">
              <div className="table-header">
                <span className="table-title">Indexed Tenant Documents</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>FILENAME</th>
                    <th>FORMAT</th>
                    <th>SIZE</th>
                    <th>CHUNKS</th>
                    <th>STATUS</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'playground' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">RAG Retrieval Playground</h1>
              <p className="page-subtitle">
                Test grounded question answering with live context inspection and source citation parsing.
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
                </div>
                <form
                  className="chat-input-bar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                >
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Ask a technical or policy question..."
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                  />
                  <button type="submit" className="btn">
                    Ask
                  </button>
                </form>
              </div>

              {/* Context Inspector */}
              <div className="context-inspector">
                <div className="context-title">
                  <span>GROUNDED CONTEXT</span>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>HYBRID RRF</span>
                </div>
                {contextChunks.map((chunk, idx) => (
                  <div key={idx} className="chunk-card">
                    <div className="chunk-meta">
                      [{idx + 1}] {chunk.filename} (Score: {chunk.score})
                    </div>
                    <div className="chunk-snippet">{chunk.snippet}</div>
                  </div>
                ))}
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
                    <td>SLA turnaround for standard support tickets</td>
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
                    <td>I demand to speak to a real person right now!</td>
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
    </div>
  );
}

export default App;
