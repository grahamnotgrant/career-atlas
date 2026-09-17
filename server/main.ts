import { Store } from "./store";
import { createApp } from "./app";
import { dataDirectory } from "./paths";
const dir = dataDirectory(),
  store = new Store(dir),
  app = await createApp(store);
const port = Number(process.env.PORT ?? 4317);
try {
  const url = await app.listen({ host: "127.0.0.1", port });
  console.log(`Career Flow: ${url}\nData: ${dir}`);
} catch (error) {
  console.error(
    `Unable to start on port ${port}. Set PORT to an unused port.`,
    error,
  );
  store.close();
  process.exit(1);
}
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    app.close().then(() => {
      store.close();
      process.exit(0);
    });
  });
