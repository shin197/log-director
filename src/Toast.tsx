import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
type ToastMessage = { id: string; message: string };
const eventName = 'log-director:error';
export function notifyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  window.dispatchEvent(
    new CustomEvent(eventName, { detail: message.replace(/^Error:\s*/, '') }),
  );
}
function ToastItem({ item, dismiss }: { item: ToastMessage; dismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(dismiss, 6500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="error-toast" role="alert">
      <div>
        <strong>오류</strong>
        <p>{item.message}</p>
      </div>
      <button aria-label="오류 알림 닫기" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
export function ToastHost() {
  const [items, setItems] = useState<ToastMessage[]>([]);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setItems((previous) => [
        ...previous.slice(-4),
        { id: crypto.randomUUID(), message },
      ]);
    };
    const error = (event: ErrorEvent) => notifyError(event.error ?? event.message);
    const rejection = (event: PromiseRejectionEvent) => notifyError(event.reason);
    window.addEventListener(eventName, receive);
    window.addEventListener('error', error);
    window.addEventListener('unhandledrejection', rejection);
    return () => {
      window.removeEventListener(eventName, receive);
      window.removeEventListener('error', error);
      window.removeEventListener('unhandledrejection', rejection);
    };
  }, []);
  useEffect(() => {
    const elevate = () => {
      if (!items.length) return;
      const element = host.current;
      if (element) {
        if (element.matches(':popover-open')) element.hidePopover();
        element.showPopover();
      }
    };
    elevate();
    const observer = new MutationObserver((records) => {
      if (records.some((r) => r.target instanceof HTMLDialogElement && r.target.open))
        elevate();
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    if (!items.length && host.current?.matches(':popover-open'))
      host.current.hidePopover();
    return () => observer.disconnect();
  }, [items.length]);
  return createPortal(
    <div ref={host} popover="manual" className="toast-host" aria-label="오류 알림">
      {items.map((item) => (
        <ToastItem
          key={item.id}
          item={item}
          dismiss={() => setItems((previous) => previous.filter((x) => x.id !== item.id))}
        />
      ))}
    </div>,
    document.body,
  );
}
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    notifyError(error);
  }
  render() {
    return this.state.failed ? (
      <div className="project-panel">
        <p>
          화면을 표시하지 못했습니다. 저장하지 않은 작업이 있다면 새로고침 전에
          확인해주세요.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
