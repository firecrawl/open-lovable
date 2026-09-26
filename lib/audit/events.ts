import {randomUUID} from 'node:crypto';
import {z} from 'zod';

export const domainEventSchema=z.object({eventId:z.string().uuid(),sequence:z.number().int().positive(),workspaceId:z.string().uuid(),projectId:z.string().uuid(),runId:z.string().uuid(),type:z.string().min(1).max(80),occurredAt:z.string().datetime(),payload:z.record(z.unknown())});
export type DomainEvent=z.infer<typeof domainEventSchema>;
const sensitive=/(password|secret|token|api[-_]?key|credential|authorization|cookie|privatekey)/i;
export function redactEventPayload(value:unknown):unknown{
 if(Array.isArray(value))return value.map(redactEventPayload);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,sensitive.test(key)?'[REDACTED]':redactEventPayload(item)]));
 return value;
}
export function createDomainEvent(input:Omit<DomainEvent,'eventId'|'occurredAt'|'payload'>&{payload:unknown}):DomainEvent{
 return domainEventSchema.parse({...input,eventId:randomUUID(),occurredAt:new Date().toISOString(),payload:redactEventPayload(input.payload)});
}
