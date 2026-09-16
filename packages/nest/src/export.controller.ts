import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  type Type,
} from "@nestjs/common";
import {
  exportResolvedSubject,
  InvalidSubjectIdError,
  PermissionDeniedError,
  parsePermissionsExportPath,
  SubjectNotFoundError,
  type VeguiPermsService,
} from "vperms";
import { MISSING_CONTEXT_MESSAGE } from "./messages";
import { VPERMS_OPTIONS, VPERMS_SERVICE } from "./tokens";
import {
  VPERMS_STATE,
  type VPermsModuleOptions,
  type VpermsRequest,
} from "./types";

/**
 * Builds the controller serving `permissionsExport`.
 *
 * A fresh controller class is created per `forRoot` call so the module never
 * mutates global metadata. The route delegates to the same framework
 * independent `exportResolvedSubject` used by the Express integration.
 */
export function createPermissionsExportController(path: string): Type<unknown> {
  const parsed = parsePermissionsExportPath(path);

  @Controller(parsed.base)
  class PermissionsExportController {
    constructor(
      @Inject(VPERMS_OPTIONS) private readonly options: VPermsModuleOptions,
      @Inject(VPERMS_SERVICE) private readonly service: VeguiPermsService,
    ) {}

    @Get(parsed.routePattern)
    async get(
      @Req() req: VpermsRequest,
      @Param(parsed.param) subjectId: string,
    ) {
      const state = req[VPERMS_STATE];
      if (!state) {
        throw new Error(MISSING_CONTEXT_MESSAGE);
      }

      try {
        return await exportResolvedSubject({
          service: this.service,
          adapter: this.options.adapter,
          workspaceId: this.options.workspace,
          currentSubjectId: state.id,
          targetSubjectId: subjectId,
          ability: state.ability,
        });
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          throw new ForbiddenException(error.message);
        }
        if (error instanceof SubjectNotFoundError) {
          throw new NotFoundException(error.message);
        }
        if (error instanceof InvalidSubjectIdError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
    }
  }

  return PermissionsExportController;
}
