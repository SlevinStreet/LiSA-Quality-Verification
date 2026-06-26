import { createClient } from './insforge-sdk.js';

const client = createClient({
  baseUrl: 'https://76vnn7ex.us-east.insforge.app',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDE1NjN9._8uHKHDFujGrwK9stWMBOcETYmK5b9KmWS56LCWbnWI'
});

window.insforgeClient = client;
export default client;
