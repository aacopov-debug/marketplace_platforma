import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const api = {
    get: (url, opts) => axios.get(`${API_URL}${url}`, opts),
    post: (url, data, opts) => axios.post(`${API_URL}${url}`, data, opts),
    put: (url, data, opts) => axios.put(`${API_URL}${url}`, data, opts),
    delete: (url, opts) => axios.delete(`${API_URL}${url}`, opts),
};
export default API_URL;
