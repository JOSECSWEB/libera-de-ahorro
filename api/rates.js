// Trae en vivo la tasa oficial BCV y la tasa Binance P2P (USDT/VES).
// Fuente: pydolarve.org — API pública y gratuita, sin necesidad de API key.
// No requiere PIN porque es información pública de solo lectura (no toca tus movimientos).

const SOURCE_BASE = 'https://pydolarve.org/api/v1/dollar';

async function fetchWithTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// La API agrupa monitores por "página". Buscamos el precio probando varias
// claves conocidas y, si no calza ninguna, usamos el primer monitor disponible
// como respaldo (para no romper si la fuente cambia ligeramente su formato).
function extractPrice(json, candidateKeys) {
  const monitors = json && (json.monitors || json.monitor || json);
  if (!monitors || typeof monitors !== 'object') return null;

  for (const key of candidateKeys) {
    const m = monitors[key];
    if (m && typeof m.price === 'number') {
      return { price: m.price, lastUpdate: m.last_update || m.lastUpdate || null };
    }
  }
  // Respaldo: primer monitor con un precio numérico
  for (const key of Object.keys(monitors)) {
    const m = monitors[key];
    if (m && typeof m.price === 'number') {
      return { price: m.price, lastUpdate: m.last_update || m.lastUpdate || null };
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const result = {
    bcv: null,
    binance: null,
    fetchedAt: new Date().toISOString(),
    errors: [],
  };

  const [bcvResult, binanceResult] = await Promise.allSettled([
    fetchWithTimeout(`${SOURCE_BASE}?page=bcv`),
    fetchWithTimeout(`${SOURCE_BASE}?page=criptodolar`),
  ]);

  if (bcvResult.status === 'fulfilled') {
    result.bcv = extractPrice(bcvResult.value, ['usd', 'bcv']);
    if (!result.bcv) result.errors.push('No se pudo leer la tasa BCV de la respuesta.');
  } else {
    result.errors.push('No se pudo contactar la fuente de la tasa BCV.');
  }

  if (binanceResult.status === 'fulfilled') {
    result.binance = extractPrice(binanceResult.value, ['binance', 'binancep2p', 'usdt']);
    if (!result.binance) result.errors.push('No se pudo leer la tasa Binance P2P de la respuesta.');
  } else {
    result.errors.push('No se pudo contactar la fuente de la tasa Binance P2P.');
  }

  // Cache corto en el borde de Vercel: evita golpear la fuente en cada carga
  // de la app pero mantiene el dato razonablemente fresco.
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
  res.status(200).json(result);
}
