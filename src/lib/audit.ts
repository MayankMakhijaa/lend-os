import "server-only";
import { db } from "./db";

type Actor = { id: string | null; name: string; role: string };

export async function audit(tenantId: string, actor: Actor, action: string, detail?: string, proposalId?: string) {
  await db.auditLog.create({
    data: { tenantId, proposalId, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, detail },
  });
}
