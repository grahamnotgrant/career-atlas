import { Store } from "../server/store";
import { dataDirectory } from "../server/paths";
import { demoManifest } from "../shared/demo";
const store = new Store(dataDirectory());
try {
  console.log(store.importManifest(demoManifest(), process.cwd()));
} finally {
  store.close();
}
