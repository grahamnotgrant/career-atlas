import { Store } from "../server/store";
import { dataDirectory } from "../server/paths";
import { seedWorkspaceDemo } from "../server/workspace-demo";
const store = new Store(dataDirectory());
try {
  console.log(JSON.stringify(seedWorkspaceDemo(store), null, 2));
} finally {
  store.close();
}
