import { runAdapterContractTests } from "@vperms/adapter-contract";
import { VeguiPermsMemoryAdapter } from "@vperms/core";

runAdapterContractTests("VeguiPermsMemoryAdapter", () => ({
  adapter: new VeguiPermsMemoryAdapter(),
}));
