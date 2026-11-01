import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker/worker.module.js";

// Entry point of the background worker (`npm run worker`), a separate process from the API.
// It has no HTTP server: it only runs jobs. Keeping it apart means a slow publish to Meta can
// never make the website slow, and the worker can be restarted without taking the API down.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log("PostFlow worker running: publishing scheduled posts");
}

await bootstrap();
