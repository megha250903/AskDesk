export interface WidgetStyleOptions {
  primaryColor?: string | undefined;
  position?: 'left' | 'right' | undefined;
}

export function getWidgetStyles(opts: WidgetStyleOptions = {}): string {
  const primaryColor = opts.primaryColor || '#6366f1';
  const isLeft = opts.position === 'left';
  const posAlign = isLeft ? 'left: 24px; right: auto;' : 'right: 24px; left: auto;';

  return `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
    ${posAlign}
    width: 60px;
    height: 60px;
    border-radius: 30px;
    background: linear-gradient(135deg, ${primaryColor} 0%, #4338ca 100%);
    color: #ffffff;
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 24px -4px rgba(99, 102, 241, 0.45), 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2147483647;
  }

  .askdesk-launcher:hover {
    transform: scale(1.08) translateY(-2px);
    box-shadow: 0 12px 28px -4px rgba(99, 102, 241, 0.6), 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .askdesk-launcher:active {
    transform: scale(0.96);
  }

  .askdesk-window {
    position: fixed;
    bottom: 96px;
    ${posAlign}
    width: 400px;
    height: 600px;
    max-height: calc(100vh - 120px);
    max-width: calc(100vw - 48px);
    background: #ffffff;
    border-radius: 20px;
    box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.05);
    display: none;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483646;
    border: 1px solid rgba(226, 232, 240, 0.9);
    transform-origin: ${isLeft ? 'bottom left' : 'bottom right'};
  }

  .askdesk-window.open {
    display: flex;
    animation: askdesk-popup 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes askdesk-popup {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .askdesk-header {
    background: linear-gradient(135deg, ${primaryColor} 0%, #3730a3 100%);
    color: #ffffff;
    padding: 18px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  }

  .askdesk-header-title {
    font-weight: 600;
    font-size: 15px;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .askdesk-badge {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 8px #34d399;
    display: inline-block;
  }

  .askdesk-close-btn {
    background: rgba(255, 255, 255, 0.12);
    border: none;
    color: #ffffff;
    cursor: pointer;
    font-size: 16px;
    width: 28px;
    height: 28px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
  }

  .askdesk-close-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .askdesk-messages {
    flex: 1;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: #f8fafc;
    scroll-behavior: smooth;
  }

  .askdesk-msg {
    max-width: 85%;
    padding: 11px 15px;
    border-radius: 16px;
    font-size: 13.5px;
    line-height: 1.5;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .askdesk-msg.user {
    align-self: flex-end;
    background: linear-gradient(135deg, ${primaryColor} 0%, #4338ca 100%);
    color: #ffffff;
    border-bottom-right-radius: 4px;
  }

  .askdesk-msg.assistant {
    align-self: flex-start;
    background: #ffffff;
    color: #1e293b;
    border: 1px solid #e2e8f0;
    border-bottom-left-radius: 4px;
  }

  .askdesk-citations {
    margin-top: 10px;
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
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 500;
    color: #475569;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .askdesk-citation-chip:hover {
    background: #e2e8f0;
    color: #0f172a;
    border-color: #94a3b8;
  }

  .askdesk-handover-banner {
    background: #fef3c7;
    border: 1px solid #fcd34d;
    color: #92400e;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .askdesk-input-bar {
    padding: 14px 16px;
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .askdesk-input {
    flex: 1;
    border: 1px solid #cbd5e1;
    border-radius: 24px;
    padding: 10px 16px;
    font-size: 13.5px;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .askdesk-input:focus {
    border-color: ${primaryColor};
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  .askdesk-send-btn {
    background: ${primaryColor};
    color: #ffffff;
    border: none;
    border-radius: 20px;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s ease, transform 0.1s ease;
  }

  .askdesk-send-btn:hover {
    opacity: 0.92;
  }

  .askdesk-send-btn:active {
    transform: scale(0.96);
  }

  .askdesk-typing {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 0;
  }

  .askdesk-dot {
    width: 6px;
    height: 6px;
    background: #94a3b8;
    border-radius: 50%;
    animation: askdesk-bounce 1.4s infinite ease-in-out both;
  }

  .askdesk-dot:nth-child(1) { animation-delay: -0.32s; }
  .askdesk-dot:nth-child(2) { animation-delay: -0.16s; }

  @keyframes askdesk-bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }
`;
}

export const widgetStyles = getWidgetStyles();
