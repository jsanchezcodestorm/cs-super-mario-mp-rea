import { Controller, Get, Head, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';

@Controller()
export class HealthController {
  @Get('health')
  get(@Res() response: ServerResponse) {
    this.respond(response, false);
  }

  @Head('health')
  head(@Res() response: ServerResponse) {
    this.respond(response, true);
  }

  private respond(response: ServerResponse, head: boolean) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(head ? undefined : '{"status":"ok"}');
  }
}
