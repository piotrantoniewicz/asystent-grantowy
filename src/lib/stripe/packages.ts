export type PackageDefinition = {
  id: string;
  name: string;
  questions: number;
  amountPln: number;
};

export const PACKAGES: PackageDefinition[] = [
  { id: "pakiet-50", name: "Pakiet 50", questions: 50, amountPln: 25 },
  { id: "pakiet-120", name: "Pakiet 120", questions: 120, amountPln: 49 },
  { id: "pakiet-300", name: "Pakiet 300", questions: 300, amountPln: 99 },
];

export function getPackage(id: string): PackageDefinition | undefined {
  return PACKAGES.find((p) => p.id === id);
}
