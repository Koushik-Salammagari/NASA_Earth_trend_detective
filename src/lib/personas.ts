export const PERSONAS = ["Student", "Gardener", "Farmer", "Runner", "Parent", "Homeowner", "Outdoor worker", "City planner"] as const;
export type Persona = (typeof PERSONAS)[number];
