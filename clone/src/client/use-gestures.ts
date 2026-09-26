/**
 * Turning mouse gestures on the grid into API calls. A press, hover and release become a
 * click or a drag, with Shift and Command read from the event itself.
 */
import { useEffect, useRef, type MouseEvent } from 'react';
import { columnLetter } from '../engine/address.js';
import type { Endpoint } from '../engine/gestures.js';

/** The handlers a cell or header needs to take part in a selection gesture. */
export interface GestureHandlers {
  begin: (event: MouseEvent, endpoint: Endpoint) => void;
  hover: (endpoint: Endpoint) => void;
  finish: () => void;
}

const holdOf = (event: MouseEvent): string[] => {
  const hold: string[] = [];
  if (event.shiftKey) hold.push('Shift');
  if (event.metaKey || event.ctrlKey) hold.push('Command');
  return hold;
};

const sameEndpoint = (a: Endpoint, b: Endpoint): boolean => JSON.stringify(a) === JSON.stringify(b);

const endpointValue = (endpoint: Endpoint): string | number =>
  endpoint.kind === 'cell'
    ? `${columnLetter(endpoint.col)}${endpoint.row + 1}`
    : endpoint.kind === 'column'
      ? columnLetter(endpoint.col)
      : endpoint.row + 1;

/** Build the mouse handlers for the grid. */
export const useGestures = (
  call: (type: string, body?: Record<string, unknown>) => Promise<void>,
  onGesture: () => void,
): GestureHandlers => {
  const drag = useRef<{ from: Endpoint; to: Endpoint; hold: string[]; moved: boolean } | null>(
    null,
  );

  const begin = (event: MouseEvent, endpoint: Endpoint): void => {
    event.preventDefault();
    onGesture();
    drag.current = { from: endpoint, to: endpoint, hold: holdOf(event), moved: false };
  };

  const hover = (endpoint: Endpoint): void => {
    if (!drag.current) return;
    if (!sameEndpoint(drag.current.to, endpoint)) drag.current.moved = true;
    drag.current.to = endpoint;
  };

  const finish = (): void => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.moved) {
      void call('drag', {
        from: endpointValue(current.from),
        to: endpointValue(current.to),
        hold: current.hold,
      });
    } else if (current.from.kind === 'column') {
      void call('click-column', { column: endpointValue(current.from), hold: current.hold });
    } else if (current.from.kind === 'row') {
      void call('click-row', { row: endpointValue(current.from), hold: current.hold });
    } else {
      void call('click', { cell: endpointValue(current.from), hold: current.hold });
    }
  };

  useEffect(() => {
    const release = (): void => finish();
    window.addEventListener('mouseup', release);
    return () => window.removeEventListener('mouseup', release);
  });

  return { begin, hover, finish };
};
