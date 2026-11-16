import { handleVisits, productionDeps } from '../http';

export default function visits(request: Request): Promise<Response> {
  return handleVisits(request, productionDeps(request));
}
