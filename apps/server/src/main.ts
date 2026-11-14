import 'dotenv/config';
import { createServerApplication } from './create-application.ts';
import { SERVER_CONFIGURATION, type ServerConfiguration } from './config/server-configuration.ts';

const app = await createServerApplication();
const configuration = app.get<ServerConfiguration>(SERVER_CONFIGURATION);
app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
await app.listen(configuration.port, configuration.host);
console.log(`Super Mario World co-op · http://${configuration.host}:${configuration.port}`);
