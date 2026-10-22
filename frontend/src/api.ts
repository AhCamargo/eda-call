import axios, { AxiosInstance } from "axios";

// Endereço da API. Ordem: config.js gerado no start do container (muda sem
// rebuild — tela Configurações / .env), depois o valor do build, depois local.
export const API_BASE: string =
  (window as any).EDACALL_API_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
});

export const setToken = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export default api;
