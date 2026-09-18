import { NextResponse } from "next/server";
import {
  exportResolvedSubject,
  InvalidSubjectIdError,
  PermissionDeniedError,
  resolveRequestContext,
  SubjectNotFoundError,
  type VeguiPermsService,
} from "vperms";
import { joinUrl, stripPrefix } from "../shared";
import type { ExternalBackend, NextBackend } from "./backends";

/**
 * The second argument Next passes to a catch-all Route Handler. Newer versions
 * provide an async `params`; both shapes are supported.
 */
export interface NextRouteContext {
  params?: Promise<{ path?: string[] }> | { path?: string[] };
}

export interface NextVPermsHandlers {
  GET(request: Request, context?: NextRouteContext): Promise<Response>;
}

async function resolveSegments(
  request: Request,
  context: NextRouteContext | undefined,
  prefix: string,
): Promise<string[]> {
  const params = context?.params ? await context.params : undefined;
  const fromParams = params?.path;

  if (Array.isArray(fromParams)) {
    return fromParams.filter((segment) => segment.length > 0);
  }

  return stripPrefix(new URL(request.url).pathname, prefix);
}

function parseSubjectTarget(segments: string[]): string | null {
  if (segments.length !== 2) {
    return null;
  }

  const [collection, id] = segments;
  if (collection !== "subject" || id === undefined || id.length === 0) {
    return null;
  }

  return id;
}

function exportErrorResponse(error: unknown): Response {
  if (error instanceof PermissionDeniedError) {
    return new NextResponse(null, { status: 403 });
  }
  if (error instanceof SubjectNotFoundError) {
    return new NextResponse(null, { status: 404 });
  }
  if (error instanceof InvalidSubjectIdError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

export interface LocalExportRuntime {
  service: VeguiPermsService;
}

export function createLocalHandlers(
  backend: NextBackend,
  prefix: string,
  runtime: LocalExportRuntime,
): NextVPermsHandlers {
  return {
    async GET(request, context) {
      const segments = await resolveSegments(request, context, prefix);
      const target = parseSubjectTarget(segments);

      if (target === null) {
        return new NextResponse(null, { status: 404 });
      }

      try {
        const current = await resolveRequestContext({
          adapter: backend.adapter,
          service: runtime.service,
          workspaceId: backend.workspace,
          subject: await backend.subjectResolver(request),
        });
        const dto = await exportResolvedSubject({
          service: runtime.service,
          adapter: backend.adapter,
          workspaceId: backend.workspace,
          currentSubjectId: current.id,
          targetSubjectId: target,
          ability: current.ability,
        });
        return NextResponse.json(dto);
      } catch (error) {
        return exportErrorResponse(error);
      }
    },
  };
}

export function createExternalHandlers(
  backend: ExternalBackend,
  prefix: string,
): NextVPermsHandlers {
  return {
    async GET(request, context) {
      const segments = await resolveSegments(request, context, prefix);
      if (segments.length < 2 || segments[0] !== "subject") {
        return new NextResponse(null, { status: 404 });
      }

      const url = new URL(request.url);
      const encoded = segments.map((segment) => encodeURIComponent(segment));
      const target = `${joinUrl(backend.origin, backend.prefix)}/${encoded.join(
        "/",
      )}${url.search}`;

      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.delete("content-length");

      const upstream = await (backend.fetch ?? fetch)(target, {
        method: "GET",
        headers,
        redirect: "manual",
      });

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    },
  };
}
