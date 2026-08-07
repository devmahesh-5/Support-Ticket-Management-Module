import { useEffect, useRef, useState } from 'react';

const STREAM_URL = `${process.env.REACT_APP_API_URL || '/api'}/notifications/stream/`;
const HEARTBEAT_TIMEOUT_MS = 30000;
const WATCHDOG_INTERVAL_MS = 10000;

/**
 * Opens a Server-Sent Events connection to /api/notifications/stream/ and
 * invokes `onNotification` with each live notification payload.
 * Returns whether the connection is currently open.
 *
 * Self-healing: the backend sends a heartbeat data frame every 4s; a watchdog
 * recreates the EventSource if no frame arrives for a while (dead stream), and
 * EventSource natively auto-reconnects on transport errors.
 */
export default function useNotificationStream(onNotification) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onNotification);
  handlerRef.current = onNotification;

  useEffect(() => {
    if (!('EventSource' in window)) return;

    let es = null;
    let lastFrameAt = Date.now();
    let watchdog = null;

    const connect = () => {
      try {
        es = new EventSource(STREAM_URL);
      } catch {
        return;
      }
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);
      es.onmessage = (event) => {
        if (!event.data) return;
        lastFrameAt = Date.now();
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.type === 'heartbeat') return;
          handlerRef.current?.(payload);
        } catch {
          // ignore malformed frames
        }
      };
    };

    connect();

    watchdog = setInterval(() => {
      if (Date.now() - lastFrameAt > HEARTBEAT_TIMEOUT_MS && es) {
        es.close();
        connect();
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      clearInterval(watchdog);
      if (es) es.close();
      setConnected(false);
    };
  }, []);

  return connected;
}
