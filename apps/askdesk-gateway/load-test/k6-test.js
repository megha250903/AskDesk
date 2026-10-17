import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp up to 20 users
    { duration: '20s', target: 20 }, // Stay at 20 users
    { duration: '5s', target: 0 } // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'] // Less than 1% failure
  }
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:4001';
const API_KEY = __ENV.API_KEY || 'ak_live_loadtest_key';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`
  };

  // 1. Non-streaming cached test
  const nonStreamingPayload = JSON.stringify({
    model: 'fast',
    messages: [{ role: 'user', content: 'What is the refund policy?' }],
    temperature: 0.2
  });

  const res1 = http.post(`${BASE_URL}/v1/chat/completions`, nonStreamingPayload, { headers });
  check(res1, {
    'non-streaming status is 200': (r) => r.status === 200
  });

  sleep(0.5);

  // 2. Streaming load test
  const streamingPayload = JSON.stringify({
    model: 'fast',
    messages: [{ role: 'user', content: 'Tell me about technical support' }],
    stream: true
  });

  const res2 = http.post(`${BASE_URL}/v1/chat/completions`, streamingPayload, { headers });
  check(res2, {
    'streaming status is 200': (r) => r.status === 200
  });

  sleep(0.5);
}
