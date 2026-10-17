import { widgetStyles } from './styles.js';

export interface WidgetConfig {
  tenantId: string;
  apiHost?: string;
  title?: string;
  placeholder?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?:
    | Array<{
        id: number;
        documentName: string;
        pageNumber?: number | undefined;
        snippet: string;
      }>
    | undefined;
}

export class AskDeskWidget {
  private config: Required<WidgetConfig>;
  private container: HTMLElement;
  private shadow: ShadowRoot;
  private isOpen = false;
  private conversationId?: string;
  private visitorId: string;
  private messages: ChatMessage[] = [];

  constructor(config: WidgetConfig) {
    if (!config.tenantId) {
      throw new Error('AskDeskWidget: tenantId is required');
    }

    this.config = {
      tenantId: config.tenantId,
      apiHost: config.apiHost ?? 'http://127.0.0.1:4002',
      title: config.title ?? 'Support Assistant',
      placeholder: config.placeholder ?? 'Ask a technical question...'
    };

    this.visitorId = `visitor_${Math.random().toString(36).substring(2, 9)}`;

    // Create container and attach isolated Shadow DOM
    this.container = document.createElement('div');
    this.container.id = 'askdesk-widget-container';
    this.shadow = this.container.attachShadow({ mode: 'open' });
    this.render();
  }

  mount(target: HTMLElement = document.body): void {
    target.appendChild(this.container);
  }

  destroy(): void {
    this.container.remove();
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    const windowEl = this.shadow.querySelector('.askdesk-window');
    if (windowEl) {
      windowEl.classList.toggle('open', this.isOpen);
    }
  }

  private render(): void {
    const styleEl = document.createElement('style');
    styleEl.textContent = widgetStyles;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <button class="askdesk-launcher" aria-label="Open support chat">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>

      <div class="askdesk-window">
        <div class="askdesk-header">
          <div class="askdesk-header-title">
            <span class="askdesk-badge"></span>
            ${this.config.title}
          </div>
          <button class="askdesk-close-btn" aria-label="Close chat">&times;</button>
        </div>

        <div class="askdesk-messages">
          <div class="askdesk-msg assistant">
            Hello! I am your technical assistant. How can I help you today?
          </div>
        </div>

        <form class="askdesk-input-bar">
          <input type="text" class="askdesk-input" placeholder="${this.config.placeholder}" />
          <button type="submit" class="askdesk-send-btn">Send</button>
        </form>
      </div>
    `;

    this.shadow.appendChild(styleEl);
    this.shadow.appendChild(wrapper);

    // Event listeners
    const launcher = this.shadow.querySelector('.askdesk-launcher')!;
    const closeBtn = this.shadow.querySelector('.askdesk-close-btn')!;
    const form = this.shadow.querySelector('.askdesk-input-bar')!;
    const input = this.shadow.querySelector('.askdesk-input') as HTMLInputElement;

    launcher.addEventListener('click', () => this.toggle());
    closeBtn.addEventListener('click', () => this.toggle());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      await this.sendMessage(text);
    });
  }

  async sendMessage(text: string): Promise<void> {
    this.appendMessage({ role: 'user', content: text });

    const messagesEl = this.shadow.querySelector('.askdesk-messages')!;
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'askdesk-msg assistant';
    loadingMsg.textContent = 'Thinking...';
    messagesEl.appendChild(loadingMsg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const res = await fetch(`${this.config.apiHost}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: this.config.tenantId,
          message: text,
          visitorId: this.visitorId,
          conversationId: this.conversationId
        })
      });

      loadingMsg.remove();

      if (!res.ok) {
        throw new Error('Failed to fetch response');
      }

      const data = (await res.json()) as {
        conversationId: string;
        content: string;
        citations?: Array<{
          id: number;
          documentName: string;
          pageNumber?: number;
          snippet: string;
        }>;
        handover?: { required: boolean; reason?: string };
      };

      this.conversationId = data.conversationId;
      this.appendMessage({
        role: 'assistant',
        content: data.content,
        citations: data.citations
      });

      if (data.handover?.required) {
        const banner = document.createElement('div');
        banner.className = 'askdesk-handover-banner';
        banner.textContent = '⚠️ This conversation has been escalated to a human support engineer.';
        messagesEl.appendChild(banner);
      }
    } catch {
      loadingMsg.remove();
      this.appendMessage({
        role: 'assistant',
        content: 'Sorry, I am having trouble connecting right now. Please try again in a moment.'
      });
    }
  }

  private appendMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    const messagesEl = this.shadow.querySelector('.askdesk-messages')!;

    const msgEl = document.createElement('div');
    msgEl.className = `askdesk-msg ${msg.role}`;
    msgEl.textContent = msg.content;

    if (msg.citations && msg.citations.length > 0) {
      const citationsContainer = document.createElement('div');
      citationsContainer.className = 'askdesk-citations';

      msg.citations.forEach((c) => {
        const chip = document.createElement('span');
        chip.className = 'askdesk-citation-chip';
        chip.title = c.snippet;
        chip.textContent = `[${c.id}] ${c.documentName}${c.pageNumber ? ` p.${c.pageNumber}` : ''}`;
        citationsContainer.appendChild(chip);
      });

      msgEl.appendChild(citationsContainer);
    }

    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}
