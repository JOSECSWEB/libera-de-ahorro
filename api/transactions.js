import { kv } from '@vercel/kv';

const KEY = 'transactions';

// Dos niveles de acceso:
//  - ADMIN_PIN: puede ver Y agregar/editar/borrar movimientos.
//  - VIEW_PIN (opcional): solo puede ver, no puede modificar nada.
// Si no configuras VIEW_PIN, solo existe el PIN de administrador.
function getRole(req) {
  const pin = req.headers['x-pin'] || req.headers['x-admin-pin'] || (req.body && req.body.pin);
  const adminPin = process.env.ADMIN_PIN;
  const viewPin = process.env.VIEW_PIN;
  if (adminPin && pin === adminPin) return 'admin';
  if (viewPin && pin === viewPin) return 'view';
  return null;
}

function checkPin(req) {
  // Para escribir (agregar/editar/borrar) siempre se requiere el rol admin.
  return getRole(req) === 'admin';
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const role = getRole(req);
      if (!role) {
        res.status(401).json({ error: 'PIN incorrecto' });
        return;
      }
      const list = (await kv.get(KEY)) || [];
      res.status(200).json({ role, transactions: list });
      return;
    }

    if (req.method === 'POST') {
      // Dos usos: agregar UNA transacción, o cargar el historial inicial completo (seed)
      if (!checkPin(req)) {
        res.status(401).json({ error: 'PIN incorrecto o no configurado' });
        return;
      }
      const body = req.body || {};

      if (body.action === 'seed') {
        const current = (await kv.get(KEY)) || [];
        if (current.length > 0) {
          res.status(400).json({ error: 'Ya hay movimientos cargados; el historial inicial solo se carga una vez.' });
          return;
        }
        const seedList = Array.isArray(body.transactions) ? body.transactions : [];
        await kv.set(KEY, seedList);
        res.status(200).json(seedList);
        return;
      }

      const tx = body.transaction;
      if (!tx) {
        res.status(400).json({ error: 'Falta la transacción' });
        return;
      }
      const list = (await kv.get(KEY)) || [];
      tx.id = tx.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      list.push(tx);
      await kv.set(KEY, list);
      res.status(200).json(list);
      return;
    }

    if (req.method === 'PUT') {
      if (!checkPin(req)) {
        res.status(401).json({ error: 'PIN incorrecto o no configurado' });
        return;
      }
      const body = req.body || {};
      const { id, transaction } = body;
      if (!id || !transaction) {
        res.status(400).json({ error: 'Falta id o transacción' });
        return;
      }
      const list = (await kv.get(KEY)) || [];
      const idx = list.findIndex((t) => t.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'No se encontró esa transacción' });
        return;
      }
      list[idx] = { ...transaction, id };
      await kv.set(KEY, list);
      res.status(200).json(list);
      return;
    }

    if (req.method === 'DELETE') {
      if (!checkPin(req)) {
        res.status(401).json({ error: 'PIN incorrecto o no configurado' });
        return;
      }
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ error: 'Falta id' });
        return;
      }
      const list = (await kv.get(KEY)) || [];
      const filtered = list.filter((t) => t.id !== id);
      await kv.set(KEY, filtered);
      res.status(200).json(filtered);
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno' });
  }
}
