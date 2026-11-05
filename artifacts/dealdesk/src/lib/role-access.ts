import type { Role } from '@workspace/api-client-react';

const seniority: Record<Role, number> = { Rep: 0, 'Sales Head': 1, Founder: 2 };

export function canCurrentRoleDecide(role: Role | undefined, requiredApprover: Role) {
  return role !== undefined && seniority[role] >= seniority[requiredApprover];
}

export function decisionPermissionText(requiredApprover: Role) {
  if (requiredApprover === 'Founder') return 'Only the Founder can decide.';
  if (requiredApprover === 'Sales Head') return 'Only the Sales Head or Founder can decide.';
  return 'Only the Rep, Sales Head, or Founder can decide.';
}
