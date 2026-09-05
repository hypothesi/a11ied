import { z } from 'zod';

export const driverPressPayloadSchema = z.object({
   keys: z.array(z.string().min(1)).min(1),
});
export type DriverPressPayload = z.infer<typeof driverPressPayloadSchema>;

export const driverTypePayloadSchema = z.object({ text: z.string() });
export type DriverTypePayload = z.infer<typeof driverTypePayloadSchema>;

export const driverPerformPayloadSchema = z.object({
   command: z.string().min(1),
   commandSet: z.string().optional(),
});
export type DriverPerformPayload = z.infer<typeof driverPerformPayloadSchema>;

export const driverCheckpointPayloadSchema = z.object({ label: z.string().min(1) });
export type DriverCheckpointPayload = z.infer<typeof driverCheckpointPayloadSchema>;
