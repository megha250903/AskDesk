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
}
