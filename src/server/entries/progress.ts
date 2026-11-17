import { handleSave, productionProfileDeps } from '../profiles';

export function PUT(request: Request): Promise<Response> {
  return handleSave(request, productionProfileDeps(request));
}
