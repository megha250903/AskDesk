import { AskDeskWidget, WidgetConfig } from './widget.js';

export { AskDeskWidget, WidgetConfig };

declare global {
  interface Window {
    AskDeskWidget?: typeof AskDeskWidget & {
      init?: (config: WidgetConfig) => AskDeskWidget;
    };
  }
}

if (typeof window !== 'undefined') {
  window.AskDeskWidget = AskDeskWidget as unknown as typeof AskDeskWidget & {
    init: (config: WidgetConfig) => AskDeskWidget;
  };

  window.AskDeskWidget.init = (config: WidgetConfig) => {
    const widget = new AskDeskWidget(config);
    widget.mount();
    return widget;
  };

  // Automatic initialization when loaded via <script data-tenant-id="..." ...>
  if (typeof document !== 'undefined') {
    const script = document.currentScript as HTMLScriptElement | null;
    if (script) {
      const tenantId = script.getAttribute('data-tenant-id');
      if (tenantId) {
        const apiHost = script.getAttribute('data-api-host') || undefined;
        const title = script.getAttribute('data-title') || undefined;
        const primaryColor = script.getAttribute('data-primary-color') || undefined;
        const position = (script.getAttribute('data-position') as 'left' | 'right') || undefined;
        const placeholder = script.getAttribute('data-placeholder') || undefined;
        const greeting = script.getAttribute('data-greeting') || undefined;

        const widget = new AskDeskWidget({
          tenantId,
          apiHost,
          title,
          primaryColor,
          position,
          placeholder,
          greeting
        });
        widget.mount();
      }
    }
  }
}
