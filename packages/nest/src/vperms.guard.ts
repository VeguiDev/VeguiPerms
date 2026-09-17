import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { RequestContext, VeguiPermsService } from "vperms";
import { resolveRequestContext } from "vperms";
import {
  ANY_PERMISSION_METADATA,
  PERMISSION_METADATA,
  type PermissionInput,
} from "./decorators";
import { VPERMS_OPTIONS, VPERMS_SERVICE } from "./tokens";
import {
  VPERMS_STATE,
  type VPermsModuleOptions,
  type VpermsRequest,
} from "./types";

async function resolveInput(
  req: Request,
  input: PermissionInput,
): Promise<string> {
  return typeof input === "function" ? input(req) : input;
}

/**
 * Global guard that hydrates every request with `req.ability`, `req.subject`
 * and `req.kind`, then evaluates `@Permission` / `@AnyPermission` metadata.
 *
 * Routes without any VeguiPerms metadata are left untouched, and the request
 * context is resolved at most once per request.
 */
@Injectable()
export class VPermsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(VPERMS_OPTIONS) private readonly options: VPermsModuleOptions,
    @Inject(VPERMS_SERVICE) private readonly service: VeguiPermsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<VpermsRequest>();
    const state = await this.hydrate(req);

    const all = this.reflector.getAllAndOverride<PermissionInput[] | undefined>(
      PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (all) {
      for (const input of all) {
        const permission = await resolveInput(req, input);
        if (!(await state.ability.can(permission))) {
          return false;
        }
      }
    }

    const any = this.reflector.getAllAndOverride<PermissionInput[] | undefined>(
      ANY_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (any) {
      let granted = false;
      for (const input of any) {
        const permission = await resolveInput(req, input);
        if (await state.ability.can(permission)) {
          granted = true;
          break;
        }
      }
      if (!granted) {
        return false;
      }
    }

    return true;
  }

  private async hydrate(req: VpermsRequest): Promise<RequestContext> {
    const existing = req[VPERMS_STATE];
    if (existing) {
      return existing;
    }

    const resolved = await this.options.resolver(req);
    const context = await resolveRequestContext({
      adapter: this.options.adapter,
      service: this.service,
      workspaceId: this.options.workspace,
      subject: resolved,
    });

    req.ability = context.ability;
    req.subject = context.subject;
    req.kind = context.kind;
    req[VPERMS_STATE] = context;
    return context;
  }
}
