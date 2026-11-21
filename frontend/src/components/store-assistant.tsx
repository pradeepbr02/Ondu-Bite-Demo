'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bot, Send, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Order } from '@/lib/types';
import { whatsappOrderUrl } from '@/lib/whatsapp';
import { useStore } from './store-provider';

type Topic =
  'shipping' | 'sizes' | 'checkout' | 'address' | 'ingredients' | 'order' | 'whatsapp' | 'other';
type ChatReply = {
  topic: Topic;
  message?: string;
  action?: 'order' | 'whatsapp';
  orderId?: string;
};
type Entry = {
  author: 'assistant' | 'customer';
  text: string;
  link?: { href: string; label: string };
  whatsapp?: boolean;
};

const shortcuts = [
  { topic: 'order', label: 'Track my latest order' },
  { topic: 'shipping', label: 'Shipping fees' },
  { topic: 'sizes', label: 'Pack sizes' },
] as const;

function readableStatus(status: string) {
  return status.replaceAll('_', ' ').toLowerCase();
}

async function trackOrder(orderId?: string): Promise<Omit<Entry, 'author'>> {
  try {
    const order = orderId
      ? await api<Order>(`orders/${encodeURIComponent(orderId)}`)
      : (await api<Order[]>('orders?limit=1'))[0];

    if (!order) return { text: 'There are no orders on this account yet.' };
    const summary = [
      orderId ? 'Here’s the status of that order.' : 'Here’s your latest order.',
      `Order: ${readableStatus(order.status)}. Payment: ${readableStatus(order.paymentStatus)}. Delivery: ${readableStatus(order.fulfillmentStatus)}.`,
      order.trackingNumber
        ? `Tracking: ${[order.carrier, order.trackingNumber].filter(Boolean).join(' · ')}.`
        : '',
      order.totals.pricingMode === 'DEMO' ? 'This is a preview order.' : '',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      text: summary,
      link: { href: `/orders/${order.orderId}`, label: 'View order details' },
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {
        text: 'Sign in to view your orders.',
        link: { href: '/account?next=/orders', label: 'Sign in' },
      };
    }
    if (error instanceof ApiError && error.status === 404) {
      return {
        text: 'I couldn’t find that order on your account. Check the order ID or look in Your orders.',
        link: { href: '/orders', label: 'Your orders' },
      };
    }
    throw error;
  }
}

export function StoreAssistant({ whatsappNumber }: { whatsappNumber?: string }) {
  const { customer } = useStore();
  return <ChatWidget key={customer?.id ?? 'guest'} whatsappNumber={whatsappNumber} />;
}

function ChatWidget({ whatsappNumber }: { whatsappNumber?: string }) {
  const { cart, customer } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [previousTopic, setPreviousTopic] = useState<Topic>();
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const orderUrl = whatsappOrderUrl(whatsappNumber, cart.items);

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (open && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [open, entries, busy]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  async function send(question: string, topic?: Topic) {
    if (!question.trim() || inFlight.current) return;
    inFlight.current = true;
    setDraft('');
    setBusy(true);
    setEntries((log) => [...log, { author: 'customer', text: question }]);
    let reply: Omit<Entry, 'author'>;
    try {
      const answer = await api<ChatReply>('assistant/chat', {
        method: 'POST',
        body: JSON.stringify(topic ? { topic } : { question, previousTopic }),
      });
      setPreviousTopic(answer.topic);
      if (answer.action === 'order') {
        reply = customer
          ? await trackOrder(answer.orderId)
          : {
              text: 'Sign in to track an order from your account.',
              link: { href: '/account?next=/orders', label: 'Sign in' },
            };
      } else if (answer.action === 'whatsapp') {
        reply = orderUrl
          ? {
              text: 'Open WhatsApp to review and send your order request. Our team will confirm availability and the total.',
              whatsapp: true,
            }
          : {
              text: 'WhatsApp ordering is currently unavailable.',
              link: { href: '/shop', label: 'Browse the pantry' },
            };
      } else {
        reply = { text: answer.message ?? 'Please try another question.' };
      }
    } catch (error) {
      reply = {
        text: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      };
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    setEntries((log) => [...log, { author: 'assistant', ...reply }]);
  }

  return (
    <div className="store-assistant">
      {open && (
        <section
          className="assistant-panel"
          id="store-assistant-panel"
          aria-labelledby="assistant-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          <header className="assistant-header">
            <Bot size={21} aria-hidden="true" />
            <h2 id="assistant-title">Ondu Packet assistant</h2>
            <button type="button" onClick={close} aria-label="Close assistant">
              <X size={20} />
            </button>
          </header>
          <div
            ref={transcript}
            className="assistant-transcript"
            role="log"
            aria-label="Conversation"
            tabIndex={0}
          >
            <p className="assistant-message">Ask about shipping, packs, checkout or an order.</p>
            {entries.map((entry, i) => (
              <div key={i} className={`assistant-message ${entry.author}`}>
                <span className="sr-only">
                  {entry.author === 'customer' ? 'You: ' : 'Assistant: '}
                </span>
                <div>{entry.text}</div>
                {entry.link && (
                  <Link onClick={close} href={entry.link.href}>
                    {entry.link.label}
                  </Link>
                )}
                {entry.whatsapp && orderUrl && (
                  <a href={orderUrl} target="_blank" rel="noopener noreferrer">
                    Open WhatsApp <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            ))}
            {busy && <p className="assistant-message">Checking…</p>}
          </div>
          <div className="assistant-shortcuts">
            {shortcuts.map(({ topic, label }) => (
              <button
                key={topic}
                type="button"
                disabled={busy}
                onClick={() => void send(label, topic)}
              >
                {label}
              </button>
            ))}
            {orderUrl && (
              <a href={orderUrl} target="_blank" rel="noopener noreferrer">
                Order via WhatsApp <ArrowUpRight size={13} />
              </a>
            )}
          </div>
          <form
            className="assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <input
              ref={input}
              aria-label="Ask the assistant"
              placeholder="Type your question"
              value={draft}
              maxLength={500}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Send message">
              <Send size={18} />
            </button>
          </form>
        </section>
      )}
      <button
        className="assistant-launcher"
        ref={launcher}
        type="button"
        aria-label={open ? 'Close chat' : 'Open Ondu Packet assistant'}
        aria-expanded={open}
        aria-controls={open ? 'store-assistant-panel' : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? <X size={22} aria-hidden="true" /> : <Bot size={28} aria-hidden="true" />}
      </button>
    </div>
  );
}
