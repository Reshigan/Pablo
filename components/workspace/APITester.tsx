'use client';

import {
  Send,
  Plus,
  Trash2,
  Clock,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import { useState, useCallback } from 'react';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Header {
  key: string;
  value: string;
  enabled: boolean;
}

interface APIResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-pablo-green',
  POST: 'text-pablo-blue',
  PUT: 'text-pablo-orange',
  PATCH: 'text-pablo-purple',
  DELETE: 'text-pablo-red',
};

const STATUS_COLORS: Record<string, string> = {
  '2': 'text-pablo-green',
  '3': 'text-pablo-blue',
  '4': 'text-pablo-orange',
  '5': 'text-pablo-red',
};

function getStatusColor(status: number): string {
  const first = String(status).charAt(0);
  return STATUS_COLORS[first] ?? 'text-pablo-text-muted';
}

export function APITester() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('https://jsonplaceholder.typicode.com/posts/1');
  const [activeTab, setActiveTab] = useState<'headers' | 'body' | 'params'>('headers');
  const [headers, setHeaders] = useState<Header[]>([
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'Accept', value: 'application/json', enabled: true },
  ]);
  const [body, setBody] = useState('{\n  "title": "Hello World",\n  "body": "Test post"\n}');
  const [response, setResponse] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const sendRequest = useCallback(async () => {
    setLoading(true);
    setResponse(null);
    const startTime = Date.now();

    try {
      const reqHeaders: Record<string, string> = {};
      headers.filter((h) => h.enabled && h.key).forEach((h) => {
        reqHeaders[h.key] = h.value;
      });

      const options: RequestInit = {
        method,
        headers: reqHeaders,
      };
      if (method !== 'GET' && method !== 'DELETE') {
        options.body = body;
      }

      const res = await fetch(url, options);
      const text = await res.text();
      const durationMs = Date.now() - startTime;

      let formattedBody = text;
      try {
        formattedBody = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Keep as-is if not JSON
      }

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        resHeaders[key] = value;
      });

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: formattedBody,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      setResponse({
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: err instanceof Error ? err.message : 'Request failed',
        durationMs,
      });
    } finally {
      setLoading(false);
    }
  }, [method, url, headers, body]);

  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: '', value: '', enabled: true }]);
  }, []);

  const removeHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateHeader = useCallback((index: number, field: keyof Header, value: string | boolean) => {
    setHeaders((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
    );
  }, []);

  const copyResponse = useCallback(() => {
    if (response) {
      navigator.clipboard.writeText(response.body).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [response]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      {/* URL bar */}
      <div className="flex items-center gap-2 border-b border-pablo-border bg-pablo-panel px-3 py-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as HttpMethod)}
          className={`rounded border border-pablo-border bg-pablo-input px-2 py-1 font-code text-xs font-bold outline-none ${METHOD_COLORS[method]}`}
        >
          {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL..."
          className="flex-1 rounded border border-pablo-border bg-pablo-input px-2 py-1 font-code text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendRequest();
          }}
        />
        <button
          onClick={sendRequest}
          disabled={loading || !url.trim()}
          className="flex items-center gap-1 rounded bg-pablo-gold px-3 py-1 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30"
        >
          <Send size={12} className={loading ? 'animate-pulse' : ''} />
          Send
        </button>
      </div>

      {/* Request/Response split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Request section */}
        <div className="flex w-1/2 flex-col border-r border-pablo-border">
          {/* Tabs */}
          <div className="flex border-b border-pablo-border">
            {(['headers', 'body', 'params'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 font-ui text-[11px] capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-pablo-gold text-pablo-text'
                    : 'text-pablo-text-muted hover:text-pablo-text-dim'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-2">
            {activeTab === 'headers' && (
              <div className="flex flex-col gap-1">
                {headers.map((header, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={header.enabled}
                      onChange={(e) => updateHeader(i, 'enabled', e.target.checked)}
                      className="h-3 w-3 shrink-0 accent-pablo-gold"
                    />
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => updateHeader(i, 'key', e.target.value)}
                      placeholder="Key"
                      className="w-1/3 rounded border border-pablo-border bg-pablo-input px-1.5 py-0.5 font-code text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted"
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => updateHeader(i, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 rounded border border-pablo-border bg-pablo-input px-1.5 py-0.5 font-code text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted"
                    />
                    <button
                      onClick={() => removeHeader(i)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-red/10 hover:text-pablo-red"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addHeader}
                  className="flex items-center gap-1 rounded px-2 py-1 font-ui text-[10px] text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
                >
                  <Plus size={10} />
                  Add Header
                </button>
              </div>
            )}

            {activeTab === 'body' && (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="h-full min-h-[200px] w-full resize-none rounded border border-pablo-border bg-pablo-input p-2 font-code text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
                placeholder="Request body (JSON)..."
              />
            )}

            {activeTab === 'params' && (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <p className="font-ui text-xs text-pablo-text-muted">
                  Query parameters are extracted from the URL automatically
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Response section */}
        <div className="flex w-1/2 flex-col">
          {/* Response header */}
          <div className="flex items-center gap-2 border-b border-pablo-border px-3 py-1.5">
            <span className="font-ui text-[11px] text-pablo-text-dim">Response</span>
            {response && (
              <>
                <span className={`font-code text-xs font-bold ${getStatusColor(response.status)}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
                  <Clock size={10} />
                  {response.durationMs}ms
                </span>
                <button
                  onClick={copyResponse}
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover"
                >
                  {copied ? <Check size={12} className="text-pablo-green" /> : <Copy size={12} />}
                </button>
              </>
            )}
          </div>

          {/* Response body */}
          <div className="flex-1 overflow-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-pablo-gold/30 border-t-pablo-gold" />
              </div>
            ) : response ? (
              <pre className="whitespace-pre-wrap font-code text-[11px] text-pablo-text-dim leading-relaxed">
                {response.body}
              </pre>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Send size={24} className="text-pablo-text-muted" />
                <p className="font-ui text-xs text-pablo-text-muted">
                  Send a request to see the response
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
