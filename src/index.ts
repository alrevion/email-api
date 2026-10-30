import { WorkerEntrypoint } from 'cloudflare:workers';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ExecutionContext, ForwardableEmailMessage } from '@cloudflare/workers-types';

import { Config, Env } from './config';
import { Database } from './db';
import { Mailbox } from './mailbox';
import { handleWorkerRouteError } from './hono-errors';
import { createSendRoutes } from './routes/send';
import { createReplyRoutes } from './routes/reply';
import { createAdminRoutes } from './routes/admin';
import { createDashboardRoutes } from './routes/dashboard';
import { DASHBOARD_HTML } from './dashboard/ui';

const app = new Hono<{ Bindings: Env }>();
app.onError(handleWorkerRouteError);

app.notFound((c: Context) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

app.get('/health', (c: Context) => c.json({ status: 'ok' }));

app.get('/ready', async (c: Context) => {
  const db = new Database(c.env.DB);
  const ok = await db.ping();
  return c.json({ status: ok ? 'ready' : 'not_ready', db: ok ? 'ok' : 'error' }, ok ? 200 : 503);
});

// Mount routers. Admin must be tried before /send so it isn't shadowed.
app.all('/admin/*', async (c: Context) => {
  const config = new Config(c.env);
  const db = new Database(c.env.DB);
  return createAdminRoutes(db, config).fetch(c.req.raw, c.env, optionalCtx(c));
});

// Personal mail cabinet: SPA at "/", cookie-session API under /dashboard/api.
// On API_ONLY_HOST (an API-only domain) the cabinet pages redirect to CABINET_URL.
const cabinetElsewhere = (c: Context): string | null => {
  const { API_ONLY_HOST: host, CABINET_URL: url } = c.env as Env;
  return host && url && new URL(c.req.url).hostname === host ? url.replace(/\/$/, '') + '/' : null;
};
app.get('/', (c: Context) => {
  const to = cabinetElsewhere(c);
  return to ? c.redirect(to, 301) : c.html(DASHBOARD_HTML);
});
app.get('/dashboard', (c: Context) => c.redirect(cabinetElsewhere(c) || '/', 301));
app.all('/dashboard/*', mountDashboard);

app.all('/inbound', mountReply);
app.all('/inbound/*', mountReply);
app.all('/reply', mountReply);

app.all('/send', async (c: Context) => {
  const config = new Config(c.env);
  const db = new Database(c.env.DB);
  return createSendRoutes(db, config).fetch(c.req.raw, c.env, optionalCtx(c));
});

async function mountReply(c: Context): Promise<Response> {
  const config = new Config(c.env);
  const db = new Database(c.env.DB);
  return createReplyRoutes(db, config).fetch(c.req.raw, c.env, optionalCtx(c));
}

async function mountDashboard(c: Context): Promise<Response> {
  const config = new Config(c.env);
  const db = new Database(c.env.DB);
  return createDashboardRoutes(db, config).fetch(c.req.raw, c.env, optionalCtx(c));
}

function optionalCtx(c: Context<{ Bindings: Env }>): ExecutionContext | undefined {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

/** RPC for our own Workers over a service binding (not reachable from the internet): file a raw message
 *  into the mailbox, e.g. the alrevion.com contact form, so it shows up in /dashboard and can be answered. */
export class Inbox extends WorkerEntrypoint<Env> {
  async ingest(raw: string, envelope: { from: string; to: string }): Promise<string> {
    return new Mailbox(this.env.DB, this.env.MAIL).ingest(new TextEncoder().encode(raw).buffer as ArrayBuffer, envelope);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  /** Cloudflare Email Routing handler: store the full message (R2 + D1), optionally forward. */
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    const raw = await new Response(message.raw as unknown as ReadableStream).arrayBuffer();
    const forwardTo = new Config(env).personalForwardAddr;
    const [stored, forwarded] = await Promise.allSettled([
      new Mailbox(env.DB, env.MAIL).ingest(raw, { from: message.from, to: message.to }),
      forwardTo ? message.forward(forwardTo) : Promise.reject(new Error('no forward address')),
    ]);
    if (stored.status === 'rejected') {
      console.error('[email-api] inbound store failed:', String(stored.reason));
    }
    if (forwardTo && forwarded.status === 'rejected') {
      console.error('[email-api] forward failed:', String(forwarded.reason));
    }
    // Never swallow mail: if it landed nowhere, bounce so the sender knows it wasn't delivered.
    if (stored.status === 'rejected' && forwarded.status === 'rejected') {
      message.setReject('Temporary storage failure, please retry later');
    }
  },
};
