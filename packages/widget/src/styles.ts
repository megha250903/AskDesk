export const widgetStyles = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #0f172a;
    box-sizing: border-box;
  }

  *, *::before, *::after {
    box-sizing: inherit;
  }

  .askdesk-launcher {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 28px;
    background: #0f172a;
    color: #ffffff;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, background-color 0.2s ease;
    z-index: 2147483647;
  }

  .askdesk-launcher:hover {
    transform: scale(1.05);
    background: #1e293b;
  }

  .askdesk-window {
    position: fixed;
    bottom: 92px;
    right: 24px;
    width: 380px;
    height: 580px;
    max-height: calc(100vh - 120px);
    max-width: calc(100vw - 48px);
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    display: none;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483646;
    border: 1px solid #e2e8f0;
  }

  .askdesk-window.open {
    display: flex;
  }

  .askdesk-header {
    background: #0f172a;
    color: #ffffff;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .askdesk-header-title {
    font-weight: 600;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .askdesk-badge {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: #10b981;
    display: inline-block;
  }

  .askdesk-close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
  }

  .askdesk-close-btn:hover {
    color: #ffffff;
  }

  .askdesk-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #f8fafc;
  }

  .askdesk-msg {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13.5px;
    line-height: 1.45;
  }

  .askdesk-msg.user {
    align-self: flex-end;
    background: #0f172a;
    color: #ffffff;
    border-bottom-right-radius: 2px;
  }

  .askdesk-msg.assistant {
    align-self: flex-start;
    background: #ffffff;
    color: #1e293b;
    border: 1px solid #e2e8f0;
    border-bottom-left-radius: 2px;
  }

  .askdesk-citations {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #cbd5e1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .askdesk-citation-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: #475569;
    text-decoration: none;
    cursor: pointer;
  }

  .askdesk-citation-chip:hover {
    background: #e2e8f0;
    color: #0f172a;
  }

  .askdesk-handover-banner {
    background: #fef3c7;
    border: 1px solid #fde68a;
    color: #92400e;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    margin-top: 6px;
  }

  .askdesk-input-bar {
    padding: 12px 16px;
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
    display: flex;
    gap: 8px;
  }

  .askdesk-input {
    flex: 1;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13.5px;
    outline: none;
  }

  .askdesk-input:focus {
    border-color: #0f172a;
  }

  .askdesk-send-btn {
    background: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .askdesk-send-btn:hover {
    background: #1e293b;
  }
`;
