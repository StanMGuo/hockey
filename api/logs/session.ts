import { handleLogSession, productionDeps } from '../../src/server/http';

export default function logSession(request: Request): Promise<Response> {
  return handleLogSession(request, productionDeps(request));
}
