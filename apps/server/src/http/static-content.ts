import type { IncomingMessage, ServerResponse } from 'node:http';
import { staticHandler } from './static.ts';

type Next = () => void;

export class StaticContentHandler {
  private readonly serve: ReturnType<typeof staticHandler>;

  constructor(webDistributionDirectory: string, generatedDirectory: string) {
    this.serve = staticHandler(webDistributionDirectory, generatedDirectory);
  }

  handle(request: IncomingMessage, response: ServerResponse, next: Next) {
    response.setHeader('Referrer-Policy', 'no-referrer');
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      void this.serve(request, response);
      return;
    }

    const apiRoute = path === '/api' || path.startsWith('/api/');
    const healthRoute = (request.method === 'GET' || request.method === 'HEAD') && path === '/health';
    if (apiRoute || healthRoute) {
      next();
      return;
    }
    void this.serve(request, response);
  }
}
