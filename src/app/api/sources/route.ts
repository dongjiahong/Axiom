import { ApiError, route } from "@/server/http";
import { listSources, uploadSource } from "@/server/services/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => listSources());

export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError(400, "invalid_input", "请选择要上传的文件");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadSource({ filename: file.name, buffer });
});
