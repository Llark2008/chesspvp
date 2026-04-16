import axios from 'axios';
import { env } from '../env';
import { useAuthStore } from '../store/authStore';

export const http = axios.create({
  baseURL: env.API_BASE_URL,
});

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global error handling via toast (imported lazily to avoid circular dep)
http.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { toast } = await import('../store/toastStore');
    if (!err.response) {
      toast('网络错误，请检查连接', 'error');
    } else if (err.response.status >= 500) {
      toast('服务器错误', 'error');
    }
    return Promise.reject(err);
  },
);
