import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { VeguiPermsService } from "vperms";
import { createPermissionsExportController } from "./export.controller";
import { VPERMS_OPTIONS, VPERMS_SERVICE } from "./tokens";
import type { VPermsModuleOptions } from "./types";
import { VPermsGuard } from "./vperms.guard";

@Module({})
export class VPermsModule {
  static forRoot(options: VPermsModuleOptions): DynamicModule {
    const service = new VeguiPermsService({
      adapter: options.adapter,
      defaultParents: options.defaultParents,
    });

    const controllers = options.permissionsExport
      ? [createPermissionsExportController(options.permissionsExport.path)]
      : [];

    return {
      module: VPermsModule,
      global: true,
      controllers,
      providers: [
        { provide: VPERMS_OPTIONS, useValue: options },
        { provide: VPERMS_SERVICE, useValue: service },
        VPermsGuard,
        { provide: APP_GUARD, useExisting: VPermsGuard },
      ],
      exports: [VPERMS_OPTIONS, VPERMS_SERVICE, VPermsGuard],
    };
  }
}
