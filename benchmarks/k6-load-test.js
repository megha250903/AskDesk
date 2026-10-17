import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp-up to 20 VUs
    { duration: '20s', target: 100 }, // Ramp-up to 100 VUs
    { duration: '20s', target: 100 }, // Sustained 100 VUs load
    { duration: '10s', target: 0 } // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2500'],
    http_req_failed: ['rate<0.05'] // Max 5% failures (excluding expected 429s)
  }
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://127.0.0.1:4001';
const CHAT_URL = __ENV.CHAT_URL || 'http://127.0.0.1:4002';
const API_KEY = __ENV.API_KEY || 'ak_live_benchmark_test_key_001';

export default function () {
  // 1. Health check probe
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health returns 200': (r) => r.status === 200
  });

  // 2. Chat completion request
  const chatPayload = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'You are AskDesk Support Assistant.' },
      { role: 'user', content: 'How do I generate an API key in AskDesk?' }
    ],
    temperature: 0.2
  });

  const chatHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`
  };

  const chatRes = http.post(`${BASE_URL}/v1/chat/completions`, chatPayload, {
    headers: chatHeaders
  });

  check(chatRes, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'has valid headers': (r) => r.headers['Content-Type'] !== undefined
  });

  sleep(1);
}
