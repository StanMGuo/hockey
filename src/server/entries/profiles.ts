import { handleCreate, productionProfileDeps } from '../profiles';

export function POST(request: Request): Promise<Response> {
  return handleCreate(request, productionProfileDeps(request));
}
