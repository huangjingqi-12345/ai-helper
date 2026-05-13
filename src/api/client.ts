import axios from 'axios';
import { logger } from '@/utils/logger';
import { API_BASE_URL } from '@/utils/constants';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — log outgoing requests
apiClient.interceptors.request.use(
  (config) => {
    const method = (config.method || 'GET').toUpperCase();
    const url = config.url || '';
    logger.api(method, url, { params: config.params as Record<string, unknown> });
    // Attach start time for duration calculation
    (config as unknown as Record<string, unknown>)._startTime = Date.now();
    return config;
  },
  (error: unknown) => {
    logger.error('API request error', error);
    return Promise.reject(error);
  }
);

// Response interceptor — log responses with duration
apiClient.interceptors.response.use(
  (response) => {
    const startTime = (response.config as unknown as Record<string, unknown>)._startTime as number | undefined;
    const duration = startTime ? Date.now() - startTime : 0;
    const method = (response.config.method || 'GET').toUpperCase();
    const url = response.config.url || '';
    logger.api(method, `${url} → ${response.status}`, { duration: `${duration}ms` });
    return response;
  },
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 'NETWORK_ERROR';
      const method = (error.config?.method || 'GET').toUpperCase();
      const url = error.config?.url || '';
      logger.error(`API Error: ${method} ${url} → ${status}`, error, {
        status: String(status),
        message: error.message,
      });
    } else {
      logger.error('Unknown API error', error);
    }
    return Promise.reject(error);
  }
);

export { apiClient };
