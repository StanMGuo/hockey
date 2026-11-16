import { handleVisits, productionDeps } from '../src/server/http';

export default function visits(request: Request): Promise<Response> {
  return handleVisits(request, productionDeps(request));
}
