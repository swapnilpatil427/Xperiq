// Minimal type stubs for Novu React package.
// These allow TypeScript to compile when @novu/react is not yet installed locally.
// Run `npm install` in the app directory from a machine with public npm registry access.

declare module '@novu/react' {
  import type { ReactNode, CSSProperties } from 'react';

  interface InboxAppearance {
    variables?: {
      colorPrimary?: string;
      colorForeground?: string;
      colorBackground?: string;
      colorSecondaryForeground?: string;
      colorCounter?: string;
      colorCounterForeground?: string;
      fontSize?: string;
      borderRadius?: string;
    };
    elements?: Record<string, CSSProperties | string>;
  }

  interface InboxProps {
    applicationIdentifier: string;
    subscriberId: string;
    subscriberHash?: string;
    appearance?: InboxAppearance;
    backendUrl?: string;
    socketUrl?: string;
    localization?: Record<string, string>;
    tabs?: Array<{ label: string; filter?: Record<string, unknown> }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onNotificationClick?: (notification: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPrimaryActionClick?: (notification: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSecondaryActionClick?: (notification: any) => void;
    children?: ReactNode;
  }

  export function Inbox(props: InboxProps): JSX.Element | null;

  export function NovuProvider(props: {
    applicationIdentifier: string;
    subscriberId: string;
    subscriberHash?: string;
    appearance?: InboxAppearance;
    children: ReactNode;
  }): JSX.Element;

  export function useNotifications(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notifications: any[];
    isLoading: boolean;
    hasMore: boolean;
    fetchMore: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markAsRead: (id: string) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markAllAsRead: () => Promise<any>;
    unreadCount: number;
  };
}
