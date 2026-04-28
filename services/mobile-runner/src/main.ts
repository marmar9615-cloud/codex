import { startMobileRunner } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);

startMobileRunner({ port })
  .then(({ url }) => {
    console.log(`mobile-runner listening on ${url}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
