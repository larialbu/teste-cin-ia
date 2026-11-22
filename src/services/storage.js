import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config/env.js';

function ensureArrayFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]\n', 'utf-8');
  }
}

export function loadCustomers(customersPath = getConfig().paths.customers) {
  const raw = fs.readFileSync(customersPath, 'utf-8');
  return JSON.parse(raw);
}

export function getCustomerById(customerId, customersPath) {
  const customers = loadCustomers(customersPath);
  return customers.find((c) => c.id === customerId) || null;
}

export function loadTickets(ticketsPath = getConfig().paths.tickets) {
  if (!fs.existsSync(ticketsPath)) return [];
  const raw = fs.readFileSync(ticketsPath, 'utf-8');
  return JSON.parse(raw);
}

export function loadHistory(historyPath = getConfig().paths.history) {
  ensureArrayFile(historyPath);
  try {
    const raw = fs.readFileSync(historyPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendHistoryRecord(
  record,
  historyPath = getConfig().paths.history
) {
  const history = loadHistory(historyPath);
  history.push(record);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  return { record, savedAt: historyPath, totalRecords: history.length };
}

export function saveSampleFile(filename, payload, samplesDir = getConfig().paths.samplesDir) {
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }
  const fullPath = path.join(samplesDir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf-8');
  return fullPath;
}

